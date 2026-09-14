export default async function handler(req, res) {

  // Allow frontend to call this API
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.KITE_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!apiKey || !supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({
      status: "error",
      message: "Server configuration is incomplete"
    });
  }

  try {

    // ------------------------------------------------
    // 1. Get saved Kite access token
    // ------------------------------------------------

    const sessionResponse = await fetch(
      `${supabaseUrl}/rest/v1/kite_sessions?id=eq.1&select=access_token,login_at`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseSecretKey
        }
      }
    );

    if (!sessionResponse.ok) {
      return res.status(500).json({
        status: "error",
        message: "Unable to read Kite session"
      });
    }

    const sessions = await sessionResponse.json();

    if (!sessions.length || !sessions[0].access_token) {
      return res.status(401).json({
        status: "error",
        message: "Kite login required"
      });
    }

    const accessToken = sessions[0].access_token;


    // ------------------------------------------------
    // 2. Get BANKNIFTY current price
    // ------------------------------------------------

    const bankParams = new URLSearchParams();

    bankParams.append(
      "i",
      "NSE:NIFTY BANK"
    );

    const bankResponse = await fetch(
      `https://api.kite.trade/quote/ltp?${bankParams.toString()}`,
      {
        method: "GET",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${apiKey}:${accessToken}`
        }
      }
    );

    const bankData = await bankResponse.json();

    if (
      !bankResponse.ok ||
      bankData.status !== "success"
    ) {
      return res.status(
        bankResponse.status || 500
      ).json({
        status: "error",
        message:
          bankData.message ||
          "Unable to get BANKNIFTY price"
      });
    }

    const banknifty =
      Number(
        bankData.data["NSE:NIFTY BANK"].last_price
      );


    // ------------------------------------------------
    // 3. Download NFO instrument list
    // ------------------------------------------------

    const instrumentResponse =
      await fetch(
        "https://api.kite.trade/instruments/NFO"
      );

    if (!instrumentResponse.ok) {
      return res.status(500).json({
        status: "error",
        message: "Unable to download NFO instruments"
      });
    }

    const csv =
      await instrumentResponse.text();


    // ------------------------------------------------
    // 4. Parse instrument CSV
    // ------------------------------------------------

    const lines =
      csv.trim().split("\n");

    if (lines.length < 2) {
      return res.status(500).json({
        status: "error",
        message: "NFO instrument list is empty"
      });
    }

    const headers =
      lines[0].split(",");

    const column = {};

    headers.forEach(
      (header, index) => {
        column[header.trim()] = index;
      }
    );


    const instruments = [];

    for (let i = 1; i < lines.length; i++) {

      const row =
        lines[i].split(",");

      if (row.length < headers.length) {
        continue;
      }

      instruments.push({
        instrument_token:
          row[column.instrument_token],

        tradingsymbol:
          row[column.tradingsymbol],

        name:
          row[column.name],

        expiry:
          row[column.expiry],

        strike:
          Number(row[column.strike]),

        instrument_type:
          row[column.instrument_type],

        segment:
          row[column.segment]
      });
    }


    // ------------------------------------------------
    // 5. Find BANKNIFTY options
    // ------------------------------------------------

    const bankOptions =
      instruments.filter(item =>
        item.name === "BANKNIFTY" &&
        item.segment === "NFO-OPT" &&
        (
          item.instrument_type === "CE" ||
          item.instrument_type === "PE"
        )
      );

    if (!bankOptions.length) {
      return res.status(404).json({
        status: "error",
        message: "BANKNIFTY option contracts not found"
      });
    }


    // ------------------------------------------------
    // 6. Get current India date
    // ------------------------------------------------

    const indiaTime =
      new Date(
        Date.now() + (5.5 * 60 * 60 * 1000)
      );

    const today =
      indiaTime.toISOString()
        .slice(0, 10);


    // ------------------------------------------------
    // 7. Find nearest expiry
    // ------------------------------------------------

    const expiries =
      [
        ...new Set(
          bankOptions
            .map(x => x.expiry)
            .filter(x => x >= today)
        )
      ]
      .sort();


    if (!expiries.length) {
      return res.status(404).json({
        status: "error",
        message: "No upcoming BANKNIFTY expiry found"
      });
    }

    const nearestExpiry =
      expiries[0];


    // ------------------------------------------------
    // 8. Select contracts for nearest expiry
    // ------------------------------------------------

    const expiryOptions =
      bankOptions.filter(
        x => x.expiry === nearestExpiry
      );


    // BANKNIFTY strikes are generally in 100-point steps.
    // Round current price to nearest 100.

    const atmStrike =
      Math.round(
        banknifty / 100
      ) * 100;


    // Take ±10 strikes = 21 strikes
    const selectedStrikes =
      [];

    for (
      let i = -10;
      i <= 10;
      i++
    ) {

      selectedStrikes.push(
        atmStrike + (i * 100)
      );

    }


    const selectedContracts =
      expiryOptions.filter(
        option =>
          selectedStrikes.includes(
            option.strike
          )
      );


    // ------------------------------------------------
    // 9. Create Kite quote symbols
    // ------------------------------------------------

    const quoteSymbols =
      selectedContracts.map(
        option =>
          `NFO:${option.tradingsymbol}`
      );


    if (!quoteSymbols.length) {
      return res.status(404).json({
        status: "error",
        message: "No BANKNIFTY option contracts selected"
      });
    }


    // ------------------------------------------------
    // 10. Get full quotes
    // ------------------------------------------------

    const quoteParams =
      new URLSearchParams();

    quoteSymbols.forEach(
      symbol =>
        quoteParams.append(
          "i",
          symbol
        )
    );


    const quoteResponse =
      await fetch(
        `https://api.kite.trade/quote?${quoteParams.toString()}`,
        {
          method: "GET",
          headers: {
            "X-Kite-Version": "3",
            "Authorization":
              `token ${apiKey}:${accessToken}`
          }
        }
      );


    const quoteData =
      await quoteResponse.json();


    if (
      !quoteResponse.ok ||
      quoteData.status !== "success"
    ) {

      return res.status(
        quoteResponse.status || 500
      ).json({
        status: "error",
        message:
          quoteData.message ||
          "Kite option quote request failed"
      });

    }


    // ------------------------------------------------
    // 11. Build clean option chain
    // ------------------------------------------------

    const chain =
      selectedStrikes.map(
        strike => {

          const ce =
            selectedContracts.find(
              x =>
                x.strike === strike &&
                x.instrument_type === "CE"
            );

          const pe =
            selectedContracts.find(
              x =>
                x.strike === strike &&
                x.instrument_type === "PE"
            );


          const ceQuote =
            ce
              ? quoteData.data[
                  `NFO:${ce.tradingsymbol}`
                ]
              : null;


          const peQuote =
            pe
              ? quoteData.data[
                  `NFO:${pe.tradingsymbol}`
                ]
              : null;


          return {

            strike,

            CE: ceQuote
              ? {
                  symbol:
                    ce.tradingsymbol,

                  ltp:
                    ceQuote.last_price,

                  volume:
                    ceQuote.volume,

                  oi:
                    ceQuote.oi,

                  oi_day_high:
                    ceQuote.oi_day_high,

                  oi_day_low:
                    ceQuote.oi_day_low
                }
              : null,

            PE: peQuote
              ? {
                  symbol:
                    pe.tradingsymbol,

                  ltp:
                    peQuote.last_price,

                  volume:
                    peQuote.volume,

                  oi:
                    peQuote.oi,

                  oi_day_high:
                    peQuote.oi_day_high,

                  oi_day_low:
                    peQuote.oi_day_low
                }
              : null
          };

        }
      );


    // ------------------------------------------------
    // 12. Return option chain
    // ------------------------------------------------

    return res.status(200).json({

      status: "success",

      underlying: "BANKNIFTY",

      banknifty,

      atm_strike: atmStrike,

      expiry: nearestExpiry,

      strikes: selectedStrikes,

      count: chain.length,

      data: chain,

      updated_at:
        new Date().toISOString()

    });


  } catch (error) {

    console.error(
      "Option Chain API Error:",
      error
    );

    return res.status(500).json({

      status: "error",

      message:
        "Option chain request failed"

    });

  }

}
