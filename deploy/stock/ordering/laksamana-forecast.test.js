/*
 * Uji logika keandalan prakiraan (LaksForecast.health*).
 *
 * Jalankan:  node laksamana-forecast.test.js
 *
 * Sengaja tanpa framework: modul ini dimuat lewat <script> biasa di aplikasi,
 * jadi ujinya pun cukup Node polos — tak ada yang perlu dipasang lebih dulu.
 * Yang diuji HANYA fungsi murni (tanpa DOM); penggambaran tabel tetap dicek
 * lewat browser.
 */
var F = require("./laksamana-forecast.js");

var gagal = 0, lulus = 0;
function ok(nama, syarat) {
  if (syarat) { lulus++; return; }
  gagal++;
  console.log("  GAGAL: " + nama);
}
function sama(nama, dapat, harap) {
  ok(nama + " (dapat " + JSON.stringify(dapat) + ", harap " + JSON.stringify(harap) + ")",
     JSON.stringify(dapat) === JSON.stringify(harap));
}

// Payload contoh: meniru bentuk export_forecast.py, termasuk kasus sulit
// (wape null, wape 0, nama beda casing/spasi).
var payload = {
  items: {
    "Biji Kopi (1Kg)":  { tier: "A", wape: 11.2, avg_daily: 762.76, unit: "Gram (Gr)" },
    "Mineral (330Ml)":  { tier: "A", wape: 12.7, avg_daily: 110.16, unit: "Btl" },
    "Ramoe 330Ml":      { tier: "B", wape: 24.4, avg_daily: 6.64,   unit: "Btl" },
    "Kelapa Kupas":     { tier: "C", wape: 33.4, avg_daily: 6.79,   unit: "Pcs" },
    "Bahan Tanpa Uji":  { tier: "C", wape: null, avg_daily: 1.5,    unit: "Pcs" },
    "Bahan Sempurna":   { tier: "A", wape: 0,    avg_daily: 2.0,    unit: "Pcs" },
  },
};

var rows = F.healthRows(payload);

console.log("healthRows");
sama("jumlah baris", rows.length, 6);
ok("wape null tetap null (bukan 0)",
   rows.filter(function (r) { return r.nama === "Bahan Tanpa Uji"; })[0].wape === null);
ok("wape 0 tetap 0 (bukan null)",
   rows.filter(function (r) { return r.nama === "Bahan Sempurna"; })[0].wape === 0);
sama("payload kosong aman", F.healthRows(null).length, 0);
sama("payload tanpa items aman", F.healthRows({}).length, 0);

console.log("healthTally");
sama("hitung per tier", F.healthTally(rows), { A: 3, B: 1, C: 2 });
sama("tally kosong", F.healthTally([]), { A: 0, B: 0, C: 0 });

console.log("healthView - urutan");
var turun = F.healthView(rows, { sort: "wape_desc" }).rows;
sama("paling sering meleset di puncak", turun[0].nama, "Kelapa Kupas");
ok("wape null terdorong ke bawah (wape_desc)",
   turun[turun.length - 1].nama === "Bahan Tanpa Uji");

var naik = F.healthView(rows, { sort: "wape_asc" }).rows;
sama("paling akurat di puncak", naik[0].nama, "Bahan Sempurna");
ok("wape null TIDAK menyamar jadi paling akurat (wape_asc)",
   naik[naik.length - 1].nama === "Bahan Tanpa Uji");

var pakai = F.healthView(rows, { sort: "usage_desc" }).rows;
sama("paling banyak dipakai di puncak", pakai[0].nama, "Biji Kopi (1Kg)");

var abjad = F.healthView(rows, { sort: "name" }).rows;
sama("urut nama A-Z", abjad[0].nama, "Bahan Sempurna");

console.log("healthView - cari");
sama("cari cocok sebagian", F.healthView(rows, { search: "kopi" }).total, 1);
sama("cari abaikan besar-kecil huruf", F.healthView(rows, { search: "BIJI" }).total, 1);
sama("cari abaikan spasi berlebih", F.healthView(rows, { search: "  kelapa  " }).total, 1);
sama("cari tanpa hasil", F.healthView(rows, { search: "zzz" }).rows.length, 0);
sama("cari kosong = semua", F.healthView(rows, { search: "" }).total, 6);

console.log("healthView - batas");
var potong = F.healthView(rows, { limit: 2 });
sama("baris dipotong sesuai limit", potong.rows.length, 2);
sama("total tetap jumlah SEBELUM dipotong", potong.total, 6);
var gabung = F.healthView(rows, { search: "bahan", limit: 1 });
sama("total hormati filter, bukan limit", gabung.total, 2);

console.log("healthView - ketahanan");
ok("tanpa opts tidak error", F.healthView(rows).rows.length === 6);
ok("sort tak dikenal jatuh ke bawaan",
   F.healthView(rows, { sort: "ngawur" }).rows[0].nama === "Kelapa Kupas");
ok("baris null tidak error", F.healthView(null).rows.length === 0);
var asli = rows.map(function (r) { return r.nama; }).join("|");
F.healthView(rows, { sort: "name" });
sama("sort tidak mengubah array asal", rows.map(function (r) { return r.nama; }).join("|"), asli);

console.log("");
console.log(gagal ? (gagal + " GAGAL, " + lulus + " lulus") : ("SEMUA LULUS (" + lulus + " uji)"));
process.exit(gagal ? 1 : 0);
