/**
 * Laksamana Office — Apps Script untuk modul MARKETING (Database CRM)
 * ===================================================================
 * Pasang di: Google Sheet "Database CRM" (Extensions > Apps Script).
 * Deploy: Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Salin URL /exec, tempel ke WEB_APP_URL di deploy/marketing/index.html.
 *
 * KONTRAK (sama persis dengan modul reservasi & konten):
 *   GET  ?action=getAll        -> {ok:true, data:{...seluruh DB...}}
 *   POST {action:"saveAll", data:{...}} -> {ok:true, data:{saved:true}}
 *   Error                      -> {ok:false, error:"..."}
 *
 * MODEL PENYIMPANAN (standar Office):
 *   DB_JSON  : JSON blob (kolom A, dipotong per 45.000 karakter/baris kalau
 *              panjang) = SUMBER KEBENARAN (dibaca/ditulis utuh)
 *   1_Users, 2_Clients, 3_Events, 4_Followups, 5_Activities, 6_Settings
 *            : tab rata (flattened) yang dibuat ulang tiap save, untuk dibaca
 *              manusia / dipakai pivot & laporan. JANGAN diedit manual: akan
 *              tertimpa pada save berikutnya. Edit lewat aplikasi.
 */

var DB_SHEET = 'DB_JSON';
// Google Sheets membatasi SATU SEL maksimal 50.000 karakter. DB (JSON blob)
// bisa melewati batas itu seiring data bertambah, jadi disimpan terpotong-potong
// (chunked) di kolom A, satu baris = satu potongan, lalu disambung saat dibaca.
var DB_CHUNK_SIZE = 45000;

/* ------------------------------- Router ------------------------------- */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll') return ok_(readDb_());
    return err_('unknown_action: ' + action);
  } catch (ex) { return err_(String(ex && ex.message || ex)); }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action || '';
    if (action === 'saveAll') {
      var data = body.data || {};
      writeDb_(data);
      flatten_(data);
      return ok_({ saved: true, at: new Date().toISOString() });
    }
    if (action === 'uploadReceipt') return uploadReceipt_(body);
    return err_('unknown_action: ' + action);
  } catch (ex) { return err_(String(ex && ex.message || ex)); }
}

/* ---------------------------- Baca / tulis ---------------------------- */
// Sumber kebenaran: satu JSON blob. Bila kosong, kembalikan struktur awal
// supaya klien tidak pecah pada first run.
function readDb_() {
  var sh = sheet_(DB_SHEET);
  var lastRow = sh.getLastRow();
  if (!lastRow) return emptyDb_();
  var vals = sh.getRange(1, 1, lastRow, 1).getValues();
  var raw = vals.map(function (r) { return String(r[0] || ''); }).join('').trim();
  if (!raw) return emptyDb_();
  try { return JSON.parse(raw); } catch (e) { return emptyDb_(); }
}

function writeDb_(data) {
  var sh = sheet_(DB_SHEET);
  var json = JSON.stringify(data);
  var chunks = [];
  for (var i = 0; i < json.length; i += DB_CHUNK_SIZE) chunks.push([json.slice(i, i + DB_CHUNK_SIZE)]);
  if (!chunks.length) chunks.push(['']);
  var oldLastRow = sh.getLastRow();
  if (oldLastRow > chunks.length) sh.getRange(chunks.length + 1, 1, oldLastRow - chunks.length, 1).clearContent();
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
}

function emptyDb_() {
  return {
    users: [], clients: [], events: [], followups: [], activities: [],
    settings: {
      dpPercent: 30, pb1: 10, serviceCharge: 6,
      approvalThreshold: 25000000, discountThreshold: 15,
      fuTarget: 10, invPrefix: 'INV/LM/2026/'
    }
  };
}

/* ------------------------- Tab rata (flatten) -------------------------- */
// Ditulis ulang tiap save. Kolom mengikuti field yang benar-benar dipakai app.
function flatten_(d) {
  writeTab_('1_Users', ['id','name','role','div','email','active'], (d.users || []), function (u) {
    return [u.id, u.name, u.role, u.div || '', u.email || '', u.active === false ? false : true];
  });

  writeTab_('2_Clients',
    ['id','nama','perusahaan','pic','hp','email','source','status','mktPIC','nextFU','totalSpending','createdAt'],
    (d.clients || []), function (c) {
      return [c.id, c.nama, c.perusahaan || '', c.pic || '', c.hp || '', c.email || '',
              c.source || '', c.status || '', c.mktPIC || '', c.nextFU || '',
              c.totalSpending || 0, c.createdAt || ''];
    });

  // 3_Events dan 4_Followups sebelumnya TIDAK ADA di sheet (lubang skema).
  writeTab_('3_Events',
    ['id','clientId','nama','jenis','tanggal','status','pax','mktPIC','invoiceSent','totalDP','createdAt'],
    (d.events || []), function (ev) {
      var paid = (ev.payments || []).reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
      return [ev.id, ev.clientId || '', ev.nama || '', ev.jenis || '', ev.tanggal || '',
              ev.status || '', ev.pax || 0, ev.mktPIC || '',
              ev.invoiceSent ? 'YA' : 'BELUM', paid, ev.createdAt || ''];
    });

  writeTab_('4_Followups', ['id','clientId','by','note','next','at'], (d.followups || []), function (f) {
    return [f.id, f.clientId || '', f.by || '', f.note || '', f.next || '', f.at || ''];
  });

  writeTab_('5_Activities', ['id','refType','refId','action','detail','by','at'], (d.activities || []), function (a) {
    return [a.id, a.refType || '', a.refId || '', a.action || '', a.detail || '', a.by || '', a.at || ''];
  });

  // Settings sebagai pasangan field/value agar mudah dibaca.
  var s = d.settings || {};
  var rows = Object.keys(s).map(function (k) { return [k, typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k]]; });
  writeTabRows_('6_Settings', ['field', 'value'], rows);
}

/* ------------------------ Upload bukti transfer ------------------------ */
// File (foto/PDF bukti TF) dikirim sebagai base64 dari browser, disimpan ke
// Google Drive (folder khusus di lokasi Sheet yang sama), link-nya disimpan
// di data pembayaran. Cara ini sengaja tidak menaruh file di dalam blob _DB
// (akan langsung memperparah masalah batas 50.000 karakter/sel).
var RECEIPT_FOLDER_NAME = 'Bukti Transfer - Database CRM';

function uploadReceipt_(body) {
  var fileName = String(body.fileName || 'bukti_transfer').trim() || 'bukti_transfer';
  var mime = String(body.mimeType || 'application/octet-stream');
  var b64 = String(body.dataBase64 || '');
  if (!b64) return err_('missing_file');
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, mime, fileName);
  var folder = receiptFolder_();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return ok_({ url: file.getUrl(), fileId: file.getId(), name: fileName });
}

function receiptFolder_() {
  var ssFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var parents = ssFile.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(RECEIPT_FOLDER_NAME);
  return it.hasNext() ? it.next() : parent.createFolder(RECEIPT_FOLDER_NAME);
}

/* ------------------------------ Utilitas ------------------------------ */
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeTab_(name, headers, list, mapFn) {
  writeTabRows_(name, headers, (list || []).map(mapFn));
}

// Hapus isi lama lalu tulis header + baris. Aman untuk list kosong.
function writeTabRows_(name, headers, rows) {
  var sh = sheet_(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sh.setFrozenRows(1);
}

function ok_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err_(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
