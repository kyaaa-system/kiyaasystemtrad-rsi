// generate-prices.js
// Jalankan: node generate-prices.js
// Mengambil data Yahoo Finance untuk semua saham KOMPAS100 via API Vercel,
// lalu menyimpan ke data/prices.json agar dashboard langsung memuat tanpa proxy.

const SYMBOLS = "AADI ACES ADMR ADRO AKRA AMMN AMRT ANTM ARCI ARTO ASII BBCA BBNI BBRI BBTN BBYB BFIN BIPI BKSL BMRI BNBR BRIS BRMS BRPT BSDE BUKA BULL BUMI BUVA CBDK CMRY COIN CPIN CTRA CUAN DEWA DSNG ELSA EMAS EMTK ENRG ERAA ESSA EXCL GGRM GOTO HEAL HRTA HRUM ICBP IMPC INCO INDF INDY INET INKP ISAT ITMG JPFA JSMR KIJA KLBF KPIG LSIP MAPA MAPI MBMA MDKA MEDC MIKA MINA MYOR NCKL PANI PGAS PGEO PNLF PSAB PTBA PTRO PWON RAJA RATU RMKE SCMA SGER SMGR SMIL SMRA SSIA TAPG TINS TLKM TOBA TOWR TPIA UNTR UNVR WIFI WIRG".split(" ");

const API_BASE = "https://kiyaasystemtrad-rsi.vercel.app/api/chart";
const RANGE = "3y";
const CONCURRENCY = 5; // jumlah request paralel (jangan terlalu tinggi agar tidak rate-limited)
const RETRY_DELAY = 2000; // jeda antar retry (ms)
const MAX_RETRIES = 3;

async function fetchSymbol(sym, attempt = 1) {
  const url = `${API_BASE}?s=${encodeURIComponent(sym)}&range=${RANGE}&lite=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (!j.d || !j.c || !j.c.length) throw new Error("data kosong");
    return { d: j.d, o: j.o, c: j.c };
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      console.log(`  ⏳ ${sym} gagal (${e.message}), retry ${attempt + 1}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY * attempt);
      return fetchSymbol(sym, attempt + 1);
    }
    throw e;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`🚀 Mengambil data ${SYMBOLS.length} saham KOMPAS100 dari Yahoo Finance...\n`);
  const data = {};
  let ok = 0, fail = 0;
  const t0 = Date.now();

  // Proses dengan concurrency terbatas
  const queue = [...SYMBOLS];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      if (!sym) break;
      try {
        const result = await fetchSymbol(sym);
        data[sym] = result;
        ok++;
        const pct = ((ok + fail) / SYMBOLS.length * 100).toFixed(0);
        console.log(`  ✅ [${pct}%] ${sym} — ${result.c.length} bar`);
      } catch (e) {
        fail++;
        console.log(`  ❌ ${sym} — ${e.message}`);
      }
      // Jeda kecil antar request untuk menghindari rate limit
      await sleep(300);
    }
  });

  await Promise.all(workers);

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n📊 Hasil: ${ok} sukses, ${fail} gagal (${dur} detik)`);

  if (ok === 0) {
    console.log("❌ Tidak ada data yang berhasil diambil. Coba lagi nanti.");
    process.exit(1);
  }

  // Buat output
  const output = {
    updated: new Date().toISOString(),
    source: "Yahoo Finance via Vercel API",
    data
  };

  // Simpan ke data/prices.json
  const fs = require("fs");
  const path = require("path");
  const outDir = path.join(__dirname, "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "prices.json");
  fs.writeFileSync(outPath, JSON.stringify(output), "utf-8");

  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n💾 Tersimpan: ${outPath} (${sizeKB} KB)`);
  console.log(`📅 Diperbarui: ${output.updated}`);
  console.log(`\n✅ Selesai! Upload folder 'data' ke repo GitHub, lalu deploy ke Vercel.`);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
