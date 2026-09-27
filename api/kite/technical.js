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

    // Get latest Kite access token
    const sessionResponse = await fetch(
      `${supabaseUrl}/rest/v1/kite_sessions?id=eq.1&select=access_token`,
      {
        headers: {
          "apikey": supabaseSecretKey,
          "Authorization": `Bearer ${supabaseSecretKey}`
        },
        cache: "no-store"
      }
    );

    if (!sessionResponse.ok) {
      throw new Error("Unable to read Kite session");
    }

    const sessions = await sessionResponse.json();

    if (!sessions.length || !sessions[0].access_token) {
      return res.status(401).json({
        status: "error",
        message: "Kite login required"
      });
    }

    const accessToken = sessions[0].access_token;

    // NIFTY 50 = 256265
    // BANKNIFTY = 260105

    const now = new Date();

    // Use IST date
    const istNow = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata"
      })
    );

    const toDate = new Date(istNow);

    // Previous few days give enough candles
    const fromDate = new Date(istNow);
    fromDate.setDate(fromDate.getDate() - 7);

    function dateTime(d) {

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      return `${y}-${m}-${day} 09:15:00`;

    }

    function endTime(d) {

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      return `${y}-${m}-${day} 15:30:00`;

    }

    async function getCandles(token) {

      const url =
        `https://api.kite.trade/instruments/historical/${token}/5minute` +
        `?from=${encodeURIComponent(dateTime(fromDate))}` +
        `&to=${encodeURIComponent(endTime(toDate))}`;

      const response = await fetch(url, {
        headers: {
          "X-Kite-Version": "3",
          "Authorization":
            `token ${apiKey}:${accessToken}`
        },
        cache: "no-store"
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Kite returned invalid candle response");
      }

      if (!response.ok || data.status !== "success") {
        throw new Error(
          data.message || "Historical candle request failed"
        );
      }

      return data.data?.candles || [];
    }

    const niftyCandles =
      await getCandles(256265);

    const bankCandles =
      await getCandles(260105);

    return res.status(200).json({

      status: "success",

      timeframe: "5minute",

      nifty: {
        instrument_token: 256265,
        candles: niftyCandles
      },

      banknifty: {
        instrument_token: 260105,
        candles: bankCandles
      },

      updated_at: new Date().toISOString()

    });

  } catch (error) {

    console.error("Technical API error:", error);

    return res.status(500).json({

      status: "error",

      message:
        error.message ||
        "Technical data request failed"

    });

  }

}
