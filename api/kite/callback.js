import crypto from "crypto";

export default async function handler(req, res) {
  const { request_token } = req.query;

  if (!request_token) {
    return res.status(400).send("Missing request_token");
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!apiKey || !apiSecret) {
    return res.status(500).send("Kite API credentials are not configured");
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).send("Supabase credentials are not configured");
  }

  const checksum = crypto
    .createHash("sha256")
    .update(apiKey + request_token + apiSecret)
    .digest("hex");

  try {
    const response = await fetch(
      "https://api.kite.trade/session/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Kite-Version": "3"
        },
        body: new URLSearchParams({
          api_key: apiKey,
          request_token: request_token,
          checksum: checksum
        })
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      data.status !== "success" ||
      !data.data?.access_token
    ) {
      return res.status(400).json({
        status: data.status || "error",
        message: data.message || "Kite session generation failed"
      });
    }

    const kite = data.data;

    const saveResponse = await fetch(
      `${supabaseUrl}/rest/v1/kite_sessions?on_conflict=id`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseSecretKey,
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          id: 1,
          client_id: kite.user_id || "kite-user",
          access_token: kite.access_token,
          public_token: kite.public_token || null,
          login_at: new Date().toISOString()
        })
      }
    );

    if (!saveResponse.ok) {
      const saveError = await saveResponse.text();
      console.error("Supabase save failed:", saveError);

      return res
        .status(502)
        .send("Kite login succeeded, but token could not be saved");
    }

    return res
      .status(200)
      .send("Kite login successful. Access token securely saved.");

  } catch (error) {
    console.error("Kite callback error:", error);

    return res
      .status(500)
      .send("Kite authentication failed");
  }
}
