// Fungsi server Vercel: mengambil harga harian Yahoo Finance dari sisi server (tanpa proxy CORS).
// Contoh: /api/chart?s=BBCA&range=3y   |   IHSG: /api/chart?s=^JKSE   |   ringan: &lite=1
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HOSTS = ["query1", "query2"];

async function getJson(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ac.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const s = String(q.s || "").toUpperCase();
  if (!/^(\^[A-Z]{2,8}|[A-Z0-9]{2,6})$/.test(s)) return res.status(400).json({ error: "simbol tidak valid" });
  const range = ["1y", "2y", "3y", "5y"].includes(q.range) ? q.range : "3y";
  const lite = q.lite === "1";
  const sym = s.startsWith("^") ? s : s + ".JK";
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const h of HOSTS) {
      try {
        const j = await getJson(
          `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, 8000);
        const x = j.chart && j.chart.result && j.chart.result[0];
        if (!x || !x.timestamp) throw new Error("data kosong");
        const qu = x.indicators.quote[0], d = [], o = [], hi = [], lo = [], c = [], v = [];
        x.timestamp.forEach((ts, i) => {
          if (qu.close[i] != null && qu.open[i] != null && qu.high[i] != null && qu.low[i] != null) {
            d.push(Math.floor(ts / 86400));
            o.push(+qu.open[i].toFixed(2)); hi.push(+qu.high[i].toFixed(2));
            lo.push(+qu.low[i].toFixed(2)); c.push(+qu.close[i].toFixed(2));
            v.push(qu.volume[i] || 0);
          }
        });
        if (!c.length) throw new Error("tidak ada bar");
        res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
        return res.status(200).json(lite ? { d, o, c } : { d, o, h: hi, l: lo, c, v });
      } catch (e) {
        last = e.message;
      }
    }
  }
  res.setHeader("Cache-Control", "no-store"); // jangan simpan kegagalan di cache
  return res.status(502).json({ error: last });
};
