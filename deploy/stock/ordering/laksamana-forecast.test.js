/*
 * Uji logika murni laksamana-forecast.js: keandalan (health*),
 * lonjakan akhir pekan, dan daftar restock.
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

/* ===================== LONJAKAN AKHIR PEKAN ===================== */
// 2026-07-20 adalah Senin, jadi hari ke-5..6 dari sini = Sabtu & Minggu.
var SENIN = "2026-07-20";

console.log("upcomingDays");
var h7 = F.upcomingDays(7, SENIN);
sama("panjang jendela", h7.length, 7);
sama("mulai BESOK, bukan hari ini", h7[0].date, "2026-07-21");
sama("akhir pekan terdeteksi (Sabtu)", h7[4].date + "=" + h7[4].isWeekend, "2026-07-25=true");
sama("hari kerja bukan akhir pekan", h7[0].isWeekend, false);
// String ISO TIDAK boleh dibaca sebagai UTC: di WIB itu memundurkan tanggal
// satu hari dan membuat hari akhir pekan salah tandai.
sama("tanggal ISO dibaca lokal, tidak mundur sehari",
     F.upcomingDays(1, "2026-07-24")[0].date, "2026-07-25");

console.log("dayFactor - hanya akhir pekan");
var fcDemo = { base_daily: 10, avg_daily: 14, weekend_factor: 2.5, event_factor: 2.0, unit: "Pcs" };
sama("hari biasa = 1", F.dayFactor(fcDemo, { isWeekend: false }), 1);
sama("akhir pekan pakai weekend_factor", F.dayFactor(fcDemo, { isWeekend: true }), 2.5);
// event_factor sengaja TIDAK dipakai (kalender event cuma ada di Python).
sama("event_factor diabaikan", F.dayFactor(fcDemo, { isWeekend: false, isEvent: true }), 1);
sama("weekend_factor < 1 tidak menurunkan pemakaian",
     F.dayFactor({ weekend_factor: 0.5 }, { isWeekend: true }), 1);

console.log("daysUntilEmpty");
var bookSurge = new F.ForecastBook(
  { items: { "Kopi": fcDemo, "Tanpa Stok": { base_daily: 5, avg_daily: 5, unit: "Pcs" } } },
  { "Kopi": { stock_now: 100, stock_unit: "Pcs" } });
var kering = bookSurge.daysUntilEmpty("Kopi", { days: F.upcomingDays(45, SENIN) });
ok("mengembalikan angka hari", kering && kering.days > 0);
// Datar 100/10 = 10 hari. Dengan akhir pekan 2,5x, harus LEBIH CEPAT.
ok("lonjakan akhir pekan mempercepat habis (< 10 hari datar)", kering.days < 10);
sama("tanpa stok -> null", bookSurge.daysUntilEmpty("Tanpa Stok"), null);
sama("bahan tak dikenal -> null", bookSurge.daysUntilEmpty("Ngawur"), null);
var awet = new F.ForecastBook(
  { items: { "Awet": { base_daily: 0.01, avg_daily: 0.01, unit: "Pcs" } } },
  { "Awet": { stock_now: 9999, stock_unit: "Pcs" } })
  .daysUntilEmpty("Awet", { horizon: 30, from: SENIN });
sama("bertahan melewati jendela ditandai beyond", awet.beyond, true);
sama("beyond mengembalikan panjang jendela", awet.days, 30);

/* ===================== DAFTAR RESTOCK ===================== */
console.log("restockTable");
var bookR = new F.ForecastBook({
  items: {
    "Habis":  { base_daily: 10, avg_daily: 10, reorder_point: 100, unit: "Pcs", tier: "A", per_purchase: 1 },
    "Segera": { base_daily: 10, avg_daily: 10, reorder_point: 100, unit: "Pcs", tier: "A", per_purchase: 1 },
    "Aman":   { base_daily: 10, avg_daily: 10, reorder_point: 100, unit: "Pcs", tier: "A", per_purchase: 1 },
    "NoStok": { base_daily: 10, avg_daily: 10, reorder_point: 100, unit: "Pcs", tier: "C", per_purchase: 1 },
  },
}, {
  "Habis":  { stock_now: 50,  stock_unit: "Pcs" },   // <= RP           -> order
  "Segera": { stock_now: 140, stock_unit: "Pcs" },   // <= RP*1.5       -> soon
  "Aman":   { stock_now: 900, stock_unit: "Pcs" },   // > RP*1.5        -> safe
});
var tbl = bookR.restockTable({ from: SENIN });
sama("semua bahan masuk tabel", tbl.length, 4);
sama("paling mendesak di puncak", tbl[0].name, "Habis");
sama("urutan urgensi benar",
     tbl.map(function (r) { return r.status.key; }), ["order", "soon", "safe", "nostk"]);
ok("sisa hari ikut dihitung", tbl[0].daysLeft != null && tbl[0].daysLeft > 0);

var perlu = bookR.restockTable({ actionableOnly: true, from: SENIN });
sama("saring hanya yang perlu ditindak", perlu.length, 2);
ok("aman tidak ikut", perlu.every(function (r) { return r.status.key !== "safe"; }));
sama("cari di tabel restock", bookR.restockTable({ search: "aman", from: SENIN }).length, 1);

console.log("restockTally");
sama("hitung per status", F.restockTally(tbl), { order: 1, soon: 1, safe: 1, other: 1 });

console.log("restockCsv");
var csv = F.restockCsv(tbl);
ok("diawali BOM (Excel baca UTF-8)", csv.charCodeAt(0) === 0xFEFF);
// Header menyusul SETELAH BOM, jadi jangan menuntut posisi 0 di sini: menuntut
// 0 berarti menuntut BOM-nya tidak ada, dan dua syarat itu saling meniadakan.
ok("pemisah titik-koma", csv.indexOf("Bahan;Satuan;Stok kini") !== -1);
sama("baris = header + data", csv.trim().split("\r\n").length, 5);
var csvKutip = F.restockCsv([{
  name: 'Susu "Full" ; Cream', unit: "L", stockNow: 1, reorderPoint: 2,
  suggestOrderBase: 3, daysLeft: 4, status: { label: "Aman" }, tier: "A",
}]);
ok("titik-koma & kutip di nama di-escape",
   csvKutip.indexOf('"Susu ""Full"" ; Cream"') !== -1);

console.log("");
console.log(gagal ? (gagal + " GAGAL, " + lulus + " lulus") : ("SEMUA LULUS (" + lulus + " uji)"));
process.exit(gagal ? 1 : 0);
