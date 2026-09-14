import crypto from "crypto";

export default async function handler(req, res) {
  const { request_token } = req.query;

  if (!request_token) {
    return res.status(400).send("Missing request_token");
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).send("Kite API credentials are not configured");
  }

  const checksum = crypto
    .createHash("sha256")
    .update(apiKey + request_token + apiSecret)
    .digest("hex");

  try {
    const response = await fetch("https://api.kite.trade/session/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: request_token,
        checksum: checksum
      })
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return res.status(400).json(data);
    }

    return res.status(200).send(
      "Kite login successful. Access token generated successfully."
    );
  } catch (error) {
    return res.status(500).send("Kite authentication failed");
  }
}
