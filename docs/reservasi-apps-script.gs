/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Google Apps Script Backend (Web App)
 * ---------------------------------------------------------------------
 * VERSI 2 — FOTO DIPISAH DARI BLOB UTAMA.
 *
 * KENAPA BERUBAH:
 *   Versi 1 menyimpan foto bukti TF (base64) DI DALAM blob `_DATA`. Diukur di
 *   data produksi: blob 5,95 MB, 5,74 MB (97%) di antaranya foto. Akibatnya
 *   SETIAP aksi sekecil apa pun (mis. ubah status) harus:
 *       unduh 5,95 MB  ->  ubah 1 kata  ->  unggah & tulis ulang 5,95 MB
 *   = ~12 MB per klik, ~10-20 detik, dan rawan gagal di koneksi HP.
 *
 * PERBAIKAN:
 *   Foto dipindah ke sheet `_FILES` (1 baris per foto, dipecah antar kolom).
 *   Blob `_DATA` cuma menyimpan PENANDA "@f:<key>", jadi tinggal ~212 KB.
 *   Foto hanya diunduh saat kru menekan "Lihat Bukti" / saat OCR.
 *   Target: ubah status < 1 detik (dari ~10-20 detik).
 *
 * AKSI YANG TERSEDIA:
 *   GET  ?action=getAll                     -> {ok,data:{reservations,master,audit}}
 *   GET  ?action=getFile&key=<key>          -> {ok,data:{key,data}}   (1 foto)
 *   GET  ?action=stats                      -> {ok,data:{...}}        (diagnostik)
 *   POST {action:"saveAll", data:{...}}     -> {ok,data:{...}}
 *   POST {action:"putFile", data:{key,data}}-> {ok,data:{key,len}}
 *   POST {action:"migrate"}                 -> {ok,data:{...}}  (sekali jalan)
 *   GET  ?action=ping                       -> {ok,data:{pong:true}}
 *
 * CARA PASANG:
 *   1. Buka Sheet "Database Reserve" ▸ Extensions ▸ Apps Script.
 *   2. BACKUP DULU: File ▸ Make a copy pada Sheet-nya.
 *   3. Hapus isi Code.gs lama, TEMPEL seluruh isi file ini, Save.
 *   4. Deploy ▸ Manage deployments ▸ (edit deployment yang ada) ▸
 *      Version: New version ▸ Deploy.  URL /exec TIDAK berubah.
 *   5. Jalankan migrasi SEKALI (memindahkan foto lama ke _FILES):
 *      buka URL: <URL_EXEC>?action=migrate
 *      (atau dari editor: pilih fungsi _migrateSekarang ▸ Run)
 *
 * CATATAN:
 *   - `saveAll` OTOMATIS memisahkan foto yang masih terkirim inline, jadi
 *     aman walau versi aplikasi lama sempat menyimpan.
 *   - Foto yang tidak lagi dipakai (reservasi dihapus) dibersihkan otomatis.
 ************************************************************************/

var DATA_SHEET = "_DATA";    // blob JSON utama (TANPA foto) — jangan diedit manual
var FILE_SHEET = "_FILES";   // 1 baris per foto: A=key, B..=potongan base64
var CHUNK      = 45000;      // batas aman karakter per sel (<50.000)
var FILE_TAG   = "@f:";      // penanda di blob: "@f:<key>" = foto ada di _FILES

/* ---------- ENTRY POINTS ---------- */
function doGet(e)  {
  var p = (e && e.parameter) || {};
  return handle(p.action || "getAll", null, p);
}
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(body.action, body.data, body);
}

function handle(action, data, params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var out;
    if      (action === "getAll")  out = getAll();
    else if (action === "saveAll") out = saveAll(data);
    else if (action === "getFile") out = getFile((params && params.key) || (data && data.key));
    else if (action === "putFile") out = putFile(data);
    else if (action === "migrate") out = migrateFiles();
    else if (action === "stats")   out = stats();
    else if (action === "ping")    out = { pong: true, ts: new Date().toISOString() };
    else throw new Error("Aksi tidak dikenal: " + action);
    return json({ ok: true, data: out });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- UTIL SHEET ---------- */
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheetOf(name) {
  var sh = ss().getSheetByName(name);
  if (!sh) sh = ss().insertSheet(name);
  return sh;
}

/* ---------- BLOB UTAMA (_DATA) ---------- */
function readBlob() {
  var sh = ss().getSheetByName(DATA_SHEET);
  var empty = { reservations: [], master: null, audit: [] };
  if (!sh || sh.getLastRow() === 0) return empty;
  var vals = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  var joined = vals.map(function (r) { return r[0]; }).join("");
  if (!joined) return empty;
  try { return JSON.parse(joined); } catch (e) { return empty; }
}

function writeBlob(state) {
  var str = JSON.stringify(state);
  var sh = sheetOf(DATA_SHEET);
  sh.clearContents();
  var rows = [];
  for (var i = 0; i < str.length; i += CHUNK) rows.push([str.substring(i, i + CHUNK)]);
  if (rows.length) sh.getRange(1, 1, rows.length, 1).setValues(rows);
  return str.length;
}

function getAll() { return readBlob(); }

/* ---------- PENYIMPANAN FOTO (_FILES) ----------
   Tata letak: A = key, B..N = potongan base64 (tiap sel <= CHUNK).
   Kenapa 1 baris per foto (bukan 1 baris per potongan)? Supaya mencari foto
   cukup membaca KOLOM A saja (ringan), lalu membaca 1 baris itu — tidak perlu
   memindai seluruh isi _FILES yang bisa bermega-mega. */
function fileKeys(sh) {
  if (sh.getLastRow() === 0) return [];
  return sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return String(r[0] || ""); });
}

function getFile(key) {
  if (!key) throw new Error("key kosong");
  var sh = ss().getSheetByName(FILE_SHEET);
  if (!sh || sh.getLastRow() === 0) return { key: key, data: "" };
  var keys = fileKeys(sh);
  var row = keys.indexOf(String(key));
  if (row < 0) return { key: key, data: "" };
  var lastCol = sh.getLastColumn();
  if (lastCol < 2) return { key: key, data: "" };
  var vals = sh.getRange(row + 1, 2, 1, lastCol - 1).getValues()[0];
  return { key: key, data: vals.join("") };
}

function putFile(payload) {
  if (!payload || !payload.key) throw new Error("key kosong");
  var key = String(payload.key);
  var data = String(payload.data || "");
  var sh = sheetOf(FILE_SHEET);
  var keys = fileKeys(sh);
  var row = keys.indexOf(key);

  if (!data) {                               // data kosong = hapus foto
    if (row >= 0) sh.deleteRow(row + 1);
    return { key: key, len: 0, deleted: true };
  }
  var parts = [];
  for (var i = 0; i < data.length; i += CHUNK) parts.push(data.substring(i, i + CHUNK));

  if (row < 0) row = sh.getLastRow();         // baris baru di bawah
  else {
    // bersihkan sisa potongan lama pada baris itu (foto baru bisa lebih pendek)
    var lastCol = sh.getLastColumn();
    if (lastCol > 1) sh.getRange(row + 1, 2, 1, lastCol - 1).clearContent();
  }
  sh.getRange(row + 1, 1).setValue(key);
  if (parts.length) sh.getRange(row + 1, 2, 1, parts.length).setValues([parts]);
  return { key: key, len: data.length, chunks: parts.length };
}

/* ---------- PEMISAHAN FOTO DARI STATE ----------
   Semua field foto dikenali di sini. Kalau isinya masih data URL inline
   ("data:image/..."), foto ditulis ke _FILES dan field-nya diganti penanda
   "@f:<key>". Kalau sudah penanda, dibiarkan. */
function isInlineData(v) { return typeof v === "string" && v.indexOf("data:") === 0; }
function isRef(v)        { return typeof v === "string" && v.indexOf(FILE_TAG) === 0; }

// Memanggil fn(obj, field, key) untuk setiap kemungkinan lokasi foto.
function eachFileField(state, fn) {
  var res = (state && state.reservations) || [];
  for (var i = 0; i < res.length; i++) {
    var r = res[i];
    if (!r || !r.id) continue;
    fn(r, "dpProofData", "r:" + r.id + ":dp");
    fn(r, "docReqData",  "r:" + r.id + ":doc");
    var dps = r.dps || [];
    for (var j = 0; j < dps.length; j++) {
      if (dps[j] && dps[j].id) fn(dps[j], "proofData", "p:" + r.id + ":" + dps[j].id);
    }
  }
  var m = (state && state.master) || {};
  var rv = m.reviews || [];
  for (var k = 0; k < rv.length; k++) if (rv[k] && rv[k].id) fn(rv[k], "proofData", "rv:" + rv[k].id);
  var fb = m.feedbacks || [];
  for (var n = 0; n < fb.length; n++) if (fb[n] && fb[n].id) fn(fb[n], "proofData", "fb:" + fb[n].id);
}

// Pindahkan semua foto inline ke _FILES, ganti dgn penanda. Kembalikan jumlahnya.
function externalize(state) {
  var moved = 0, bytes = 0;
  eachFileField(state, function (obj, field, key) {
    var v = obj[field];
    if (!isInlineData(v)) return;             // sudah penanda / kosong → lewati
    putFile({ key: key, data: v });
    obj[field] = FILE_TAG + key;
    moved++; bytes += v.length;
  });
  return { moved: moved, bytes: bytes };
}

// Hapus foto yang sudah tidak dirujuk state (mis. reservasinya dihapus).
function gcFiles(state) {
  var sh = ss().getSheetByName(FILE_SHEET);
  if (!sh || sh.getLastRow() === 0) return 0;
  var hidup = {};
  eachFileField(state, function (obj, field, key) {
    if (obj[field]) hidup[key] = true;        // penanda maupun inline dianggap dipakai
  });
  var keys = fileKeys(sh);
  var buang = [];
  for (var i = 0; i < keys.length; i++) if (keys[i] && !hidup[keys[i]]) buang.push(i + 1);
  buang.sort(function (a, b) { return b - a; });          // hapus dari bawah
  for (var j = 0; j < buang.length; j++) sh.deleteRow(buang[j]);
  return buang.length;
}

/* ---------- SIMPAN ---------- */
function saveAll(state) {
  if (!state || typeof state !== "object") throw new Error("Payload data kosong/invalid");

  // Jaring pengaman: kalau versi aplikasi lama masih mengirim foto inline,
  // pisahkan di sini supaya blob tidak pernah membengkak lagi.
  var ext = externalize(state);

  var terhapus = gcFiles(state);
  var len = writeBlob(state);
  writeReadable(state);

  return {
    saved: true,
    reservations: (state.reservations || []).length,
    audit: (state.audit || []).length,
    blobChars: len,
    fotoDipisah: ext.moved,
    fotoDihapus: terhapus,
    ts: new Date().toISOString()
  };
}

/* ---------- MIGRASI SEKALI JALAN ----------
   Menarik blob lama (yang masih memuat foto), memindahkan semua fotonya ke
   _FILES, lalu menulis ulang blob tanpa foto. Semua di sisi server — tidak ada
   6 MB yang lalu-lalang ke HP. Aman diulang: foto yang sudah jadi penanda dilewati. */
function migrateFiles() {
  var t0 = new Date().getTime();
  var state = readBlob();
  var sebelum = JSON.stringify(state).length;
  var ext = externalize(state);
  var sesudah = writeBlob(state);
  writeReadable(state);
  return {
    migrasi: true,
    fotoDipindah: ext.moved,
    fotoBytes: ext.bytes,
    blobSebelum: sebelum,
    blobSesudah: sesudah,
    hemat: sebelum - sesudah,
    detik: Math.round((new Date().getTime() - t0) / 1000)
  };
}

// Dipanggil manual dari editor Apps Script (pilih fungsi ini ▸ Run).
function _migrateSekarang() { Logger.log(JSON.stringify(migrateFiles(), null, 2)); }

/* ---------- DIAGNOSTIK ---------- */
function stats() {
  var state = readBlob();
  var blob = JSON.stringify(state).length;
  var inline = 0, ref = 0;
  eachFileField(state, function (obj, field) {
    if (isInlineData(obj[field])) inline++;
    else if (isRef(obj[field])) ref++;
  });
  var sh = ss().getSheetByName(FILE_SHEET);
  return {
    blobChars: blob,
    blobMB: +(blob / 1048576).toFixed(3),
    reservations: (state.reservations || []).length,
    fotoMasihInline: inline,          // idealnya 0 setelah migrasi
    fotoSudahDipisah: ref,
    barisFiles: sh ? sh.getLastRow() : 0
  };
}

/* ---------- MIRROR SHEETS (mudah dibaca) ---------- */
function writeReadable(state) {
  writeSheet(
    "Reservations",
    ["ID","Nama","No HP","Tanggal","Jam","Pax","Meja","Status","DP","Metode DP",
     "Nominal DP","Sumber","PIC","Member","No Member","Makanan","Minuman","Catatan",
     "Dibuat Oleh","Dibuat","Diupdate","Bukti DP","Dokumen"],
    (state.reservations || []).map(function (r) {
      return [
        r.id, r.name, r.phone, r.date, r.time, r.pax, r.table, r.status, r.dpStatus,
        r.dpMethod, r.dpAmount, r.source, r.picName, r.member ? "Ya" : "Tidak",
        r.memberNo, r.foodReq, r.drinkReq, r.notes, r.createdBy,
        fmt(r.createdAt), fmt(r.updatedAt), r.dpProofData ? "✓" : "", r.docReqData ? "✓" : ""
      ];
    })
  );

  writeSheet(
    "Audit",
    ["Waktu","User","Role","Aksi","Detail"],
    (state.audit || []).map(function (a) {
      return [fmt(a.ts), a.user, a.role, a.action, a.detail];
    })
  );
}

function writeSheet(name, headers, rows) {
  var sh = ss().getSheetByName(name);
  if (!sh) sh = ss().insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#0B1F3A").setFontColor("#FFFFFF");
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

function fmt(ts) {
  if (!ts) return "";
  try { return Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"); }
  catch (e) { return ""; }
}
