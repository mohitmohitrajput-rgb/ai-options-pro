export default function handler(req, res) {
  const apiKey = process.env.KITE_API_KEY;

  if (!apiKey) {
    return res.status(500).send("KITE_API_KEY is not configured");
  }

  const redirectUrl =
    `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`;

  return res.redirect(302, redirectUrl);
}
