export default async function handler(req, res) {

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

    // ---------------------------------------------
    // 1. Get saved Kite access token
    // ---------------------------------------------

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


    // ---------------------------------------------
    // 2. Get BANKNIFTY LTP
    // ---------------------------------------------

    const bankResponse = await fetch(
      "https://api.kite.trade/quote/ltp?i=NSE%3ANIFTY%20BANK",
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


    // ---------------------------------------------
    // 3. Download latest NFO instruments
    // ---------------------------------------------

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


    // ---------------------------------------------
    // 4. Parse CSV
    // ---------------------------------------------

    const lines =
      csv.trim().split(/\r?\n/);

    if (lines.length < 2) {
      return res.status(500).json({
        status: "error",
        message: "NFO instrument list is empty"
      });
    }

    const headers =
      lines[0].split(",");

    const col = {};

    headers.forEach((header, index) => {
      col[header.trim()] = index;
    });


    const instruments = [];

    for (let i = 1; i < lines.length; i++) {

      const row =
        lines[i].split(",");

      if (row.length < headers.length) {
        continue;
      }

      const tradingsymbol =
        String(
          row[col.tradingsymbol] || ""
        ).replace(/"/g, "").trim();

      const expiry =
        String(
          row[col.expiry] || ""
        ).replace(/"/g, "").trim();

      const strike =
        Number(
          String(
            row[col.strike] || ""
          ).replace(/"/g, "").trim()
        );

      const instrumentType =
        String(
          row[col.instrument_type] || ""
        ).replace(/"/g, "").trim();

      const segment =
        String(
          row[col.segment] || ""
        ).replace(/"/g, "").trim();


      instruments.push({

        instrument_token:
          String(
            row[col.instrument_token] || ""
          ).replace(/"/g, "").trim(),

        tradingsymbol,

        expiry,

        strike,

        instrument_type:
          instrumentType,

        segment

      });

    }


    // ---------------------------------------------
    // 5. Find BANKNIFTY option contracts
    // ---------------------------------------------
    // We use tradingsymbol instead of "name"
    // because the name field may contain quotes.

    const bankOptions =
      instruments.filter(item =>

        item.segment === "NFO-OPT" &&

        (
          item.instrument_type === "CE" ||
          item.instrument_type === "PE"
        ) &&

        item.tradingsymbol
          .toUpperCase()
          .startsWith("BANKNIFTY")

      );


    if (!bankOptions.length) {

      return res.status(404).json({
        status: "error",
        message:
          "BANKNIFTY option contracts not found",
        diagnostic: {
          total_nfo_instruments:
            instruments.length,
          sample:
            instruments.slice(0, 3)
        }
      });

    }


    // ---------------------------------------------
    // 6. Current Indian date
    // ---------------------------------------------

    const indiaNow =
      new Date(
        Date.now() +
        (5.5 * 60 * 60 * 1000)
      );

    const today =
      indiaNow
        .toISOString()
        .slice(0, 10);


    // ---------------------------------------------
    // 7. Find upcoming expiries
    // ---------------------------------------------

    const expiryList =
      [
        ...new Set(
          bankOptions
            .map(x => x.expiry)
            .filter(
              expiry =>
                expiry &&
                expiry >= today
            )
        )
      ].sort();


    if (!expiryList.length) {

      return res.status(404).json({
        status: "error",
        message:
          "No upcoming BANKNIFTY expiry found",
        today,
        available_expiries:
          [
            ...new Set(
              bankOptions
                .map(x => x.expiry)
            )
          ]
            .sort()
            .slice(0, 20)
      });

    }


    const nearestExpiry =
      expiryList[0];


    // ---------------------------------------------
    // 8. Select nearest expiry
    // ---------------------------------------------

    const expiryOptions =
      bankOptions.filter(
        item =>
          item.expiry === nearestExpiry
      );


    // ---------------------------------------------
    // 9. Calculate ATM
    // ---------------------------------------------

    const atmStrike =
      Math.round(
        banknifty / 100
      ) * 100;


    // ---------------------------------------------
    // 10. Select ATM ± 10 strikes
    // ---------------------------------------------

    const selectedStrikes = [];

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
        item =>
          selectedStrikes.includes(
            item.strike
          )
      );


    if (!selectedContracts.length) {

      return res.status(404).json({
        status: "error",
        message:
          "No contracts found around ATM",
        banknifty,
        atm_strike: atmStrike,
        expiry: nearestExpiry
      });

    }


    // ---------------------------------------------
    // 11. Create quote symbols
    // ---------------------------------------------

    const quoteSymbols =
      selectedContracts.map(
        item =>
          `NFO:${item.tradingsymbol}`
      );


    // ---------------------------------------------
    // 12. Get full quotes
    // ---------------------------------------------

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


    // ---------------------------------------------
    // 13. Build option chain
    // ---------------------------------------------

    const chain =
      selectedStrikes.map(strike => {

        const ce =
          selectedContracts.find(
            item =>
              item.strike === strike &&
              item.instrument_type === "CE"
          );

        const pe =
          selectedContracts.find(
            item =>
              item.strike === strike &&
              item.instrument_type === "PE"
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

      });


    // ---------------------------------------------
    // 14. Return data
    // ---------------------------------------------

    return res.status(200).json({

      status: "success",

      underlying:
        "BANKNIFTY",

      banknifty,

      atm_strike:
        atmStrike,

      expiry:
        nearestExpiry,

      strikes:
        selectedStrikes,

      count:
        chain.length,

      data:
        chain,

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
        "Option chain request failed",

      detail:
        error.message

    });

  }

}
