export default async function handler(req, res) {
  // Allow GitHub Pages frontend to call this API
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

    const instruments = [
      "NSE:NIFTY 50",
      "NSE:NIFTY BANK"
    ];

    const params = new URLSearchParams();

    instruments.forEach((instrument) => {
      params.append("i", instrument);
    });

    const kiteResponse = await fetch(
      `https://api.kite.trade/quote/ltp?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${apiKey}:${accessToken}`
        }
      }
    );

    const data = await kiteResponse.json();

    if (!kiteResponse.ok || data.status !== "success") {
      return res.status(kiteResponse.status || 500).json({
        status: "error",
        message: data.message || "Kite market data request failed"
      });
    }

    return res.status(200).json({
      status: "success",
      data: data.data,
      updated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error("Quote API error:", error);

    return res.status(500).json({
      status: "error",
      message: "Market data request failed"
    });
  }
}
