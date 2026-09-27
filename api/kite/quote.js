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

    /* =========================
       GET KITE SESSION
    ========================= */

    const sessionResponse = await fetch(
      `${supabaseUrl}/rest/v1/kite_sessions?id=eq.1&select=access_token,login_at`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseSecretKey,
          "Authorization": `Bearer ${supabaseSecretKey}`
        },
        cache: "no-store"
      }
    );

    if (!sessionResponse.ok) {

      const sessionError =
        await sessionResponse.text();

      return res.status(500).json({
        status: "error",
        message: "Unable to read Kite session",
        detail: sessionError
      });

    }


    const sessions =
      await sessionResponse.json();


    if (
      !sessions.length ||
      !sessions[0].access_token
    ) {

      return res.status(401).json({
        status: "error",
        message: "Kite login required"
      });

    }


    const accessToken =
      sessions[0].access_token;


    const loginAt =
      sessions[0].login_at || null;



    /* =========================
       KITE MARKET DATA
    ========================= */

    const params =
      new URLSearchParams();

    params.append(
      "i",
      "NSE:NIFTY 50"
    );

    params.append(
      "i",
      "NSE:NIFTY BANK"
    );


    const kiteResponse =
      await fetch(
        `https://api.kite.trade/quote/ltp?${params.toString()}`,
        {
          method: "GET",

          headers: {
            "X-Kite-Version": "3",
            "Authorization":
              `token ${apiKey}:${accessToken}`
          },

          cache: "no-store"
        }
      );


    /* =========================
       READ KITE RESPONSE SAFELY
    ========================= */

    const rawText =
      await kiteResponse.text();


    let data = null;


    try {

      data =
        JSON.parse(rawText);

    } catch {

      return res.status(502).json({

        status: "error",

        message:
          "Kite returned a non-JSON response",

        http_status:
          kiteResponse.status,

        detail:
          rawText.substring(0, 300)

      });

    }



    /* =========================
       KITE ERROR
    ========================= */

    if (
      !kiteResponse.ok ||
      data.status !== "success"
    ) {

      return res.status(
        kiteResponse.status || 502
      ).json({

        status: "error",

        message:
          data.message ||
          "Kite market data request failed",

        error_type:
          data.error_type || null,

        kite_status:
          data.status || null,

        http_status:
          kiteResponse.status,

        session_login_at:
          loginAt

      });

    }



    /* =========================
       SUCCESS
    ========================= */

    return res.status(200).json({

      status: "success",

      data:
        data.data,

      updated_at:
        new Date().toISOString(),

      session_login_at:
        loginAt

    });


  } catch (error) {

    console.error(
      "Quote API error:",
      error
    );


    return res.status(500).json({

      status: "error",

      message:
        "Market data request failed",

      detail:
        error.message

    });

  }

}
