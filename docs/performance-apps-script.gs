/**
 * Laksamana Office — Apps Script untuk modul STAFF PERFORMANCE (Database Performance)
 * ==================================================================================
 * Pasang di: Google Sheet "Database Performance" (Extensions > Apps Script).
 * Deploy: Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Salin URL /exec, tempel ke WEB_APP_URL di deploy/hr/index.html.
 *
 * KONTRAK (standar Office, sama persis dengan reservasi / konten / marketing):
 *   GET  ?action=getAll        -> {ok:true, data:{...seluruh DB..., _rev:n}}
 *   POST {action:"saveAll", data:{...}, baseRev:n, by:"Nama"}
 *                              -> {ok:true, data:{saved:true, rev:n+1}}
 *                              -> {ok:false, error:"conflict", serverRev, savedBy, savedAt}
 *   Error                      -> {ok:false, error:"..."}
 *
 * ANTI-TABRAKAN (optimistic locking):
 *   Simpan menimpa SELURUH DB, jadi dua orang yang menyimpan bersamaan bisa
 *   saling menghapus. Tiap save menaikkan _rev. Klien mengirim baseRev = _rev
 *   yang dia pegang; kalau sudah tidak sama dengan yang di server, save DITOLAK
 *   dengan error "conflict" (bukan ditimpa diam-diam). LockService menjaga
 *   baca-lalu-tulis tetap atomik.
 *   baseRev tidak dikirim -> pemeriksaan dilewati (kompatibel dgn klien lama).
 *
 * MODEL PENYIMPANAN (standar Office):
 *   DB_JSON  : JSON blob (kolom A, dipotong per 45.000 karakter/baris kalau
 *              panjang) = SUMBER KEBENARAN (dibaca/ditulis utuh)
 *   1_Employees ... 9_Settings
 *            : tab rata (flattened) yang dibuat ulang tiap save, untuk dibaca
 *              manusia / dipakai pivot & laporan. JANGAN diedit manual: akan
 *              tertimpa pada save berikutnya. Edit lewat aplikasi.
 *
 * CATATAN DATA SENSITIF: modul ini menyimpan data PERFORMA (skor, pelanggaran,
 * coaching). Dokumen administratif (KTP, NPWP, kontrak, payroll) tetap di
 * Mekari Talenta, jangan diduplikasi ke sini.
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
    if (action === 'saveAll') return saveAll_(body);
    return err_('unknown_action: ' + action);
  } catch (ex) { return err_(String(ex && ex.message || ex)); }
}

/* --------------------------- Simpan + anti-tabrakan --------------------------- */
// Dikunci supaya baca _rev -> bandingkan -> tulis tidak bisa disisipi request lain.
// Tanpa kunci, dua save berbarengan sama-sama lolos pemeriksaan lalu saling menimpa.
function saveAll_(body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (ex) { return err_('busy'); }
  try {
    var data = body.data || {};
    var cur = readDb_();
    var curRev = +(cur && cur._rev) || 0;
    var baseRev = body.baseRev;

    // Klien mengirim baseRev tapi sudah ketinggalan -> tolak, jangan timpa.
    if (baseRev !== undefined && baseRev !== null && (+baseRev) !== curRev) {
      return err_('conflict', {
        serverRev: curRev,
        savedBy: (cur && cur._savedBy) || '',
        savedAt: (cur && cur._savedAt) || ''
      });
    }

    data._rev = curRev + 1;
    data._savedAt = new Date().toISOString();
    data._savedBy = String(body.by || '');
    writeDb_(data);
    flatten_(data);
    return ok_({ saved: true, rev: data._rev, at: data._savedAt });
  } finally {
    lock.releaseLock();
  }
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

// Struktur kosong. Sengaja TANPA employees/divisions/kpiTemplates dummy: klien
// (seed() di deploy/hr/index.html) yang mengisi data awal pada first run lalu
// menyimpannya ke sini. Server cukup tahu bentuk koleksinya.
function emptyDb_() {
  return {
    version: 1,
    settings: {},
    divisions: [], employees: [], kpiTemplates: [],
    kpiActuals: {}, monthlyInputs: {},
    okrs: [], reviews: [], competencies: [],
    trainings: [], trainingRecords: [], coachings: [],
    rewards: [], badges: [], violations: [], feedbacks: [],
    careerPaths: [], successions: [], moods: [], suggestions: [],
    calendar: [], audit: []
  };
}

/* ------------------------- Tab rata (flatten) -------------------------- */
// Ditulis ulang tiap save. Kolom mengikuti field yang benar-benar dipakai app.
function flatten_(d) {
  var divName = {};
  (d.divisions || []).forEach(function (v) { divName[v.id] = v.name; });
  var empName = {};
  (d.employees || []).forEach(function (e) { empName[e.id] = e.name; });

  writeTab_('1_Employees',
    ['id','nama','jabatan','divisi','level','appRole','status','joinDate','contractEnd'],
    (d.employees || []), function (e) {
      return [e.id, e.name || '', e.role || '', divName[e.divId] || '', e.level || '',
              e.appRole || '', e.status || '', e.joinDate || '', e.contractEnd || ''];
    });

  // KPI aktual disimpan bersarang { divId: { 'YYYY-MM': { kpiItemId: nilai } } }.
  // Diratakan jadi satu baris per indikator per bulan supaya bisa dipivot.
  var kpiItemName = {}, kpiItemDiv = {};
  (d.kpiTemplates || []).forEach(function (t) {
    (t.items || []).forEach(function (it) { kpiItemName[it.id] = it.name; kpiItemDiv[it.id] = t.divId; });
  });
  var kpiRows = [];
  var acts = d.kpiActuals || {};
  Object.keys(acts).forEach(function (divId) {
    Object.keys(acts[divId] || {}).forEach(function (mk) {
      var m = acts[divId][mk] || {};
      Object.keys(m).forEach(function (itemId) {
        kpiRows.push([divName[divId] || divId, mk, kpiItemName[itemId] || itemId, m[itemId]]);
      });
    });
  });
  writeTabRows_('2_KPI_Aktual', ['divisi','bulan','indikator','aktual'], kpiRows);

  // Input bulanan per kru { empId: { 'YYYY-MM': {...} } }.
  var miRows = [];
  var mis = d.monthlyInputs || {};
  Object.keys(mis).forEach(function (empId) {
    Object.keys(mis[empId] || {}).forEach(function (mk) {
      var o = mis[empId][mk] || {};
      miRows.push([empName[empId] || empId, mk, o.attendance || '', o.review || '', o.kpiOverride || '']);
    });
  });
  writeTabRows_('3_Input_Bulanan', ['kru','bulan','attendance','review','kpiOverride'], miRows);

  writeTab_('4_Reviews', ['id','kru','bulan','status','self','manager','hr','ceo'],
    (d.reviews || []), function (r) {
      var L = r.layers || {};
      var filled = function (k) { return (L[k] && L[k].aspects && Object.keys(L[k].aspects).length) ? 'terisi' : ''; };
      return [r.id, empName[r.empId] || r.empId, r.month || '', r.status || '',
              filled('self'), filled('manager'), filled('hr'), filled('ceo')];
    });

  writeTab_('5_Training', ['id','kru','program','status','skor','tanggal','noSertifikat'],
    (d.trainingRecords || []), function (r) {
      var t = (d.trainings || []).find(function (x) { return x.id === r.trainingId; });
      return [r.id, empName[r.empId] || r.empId, (t && t.title) || r.trainingId,
              r.status || '', r.score == null ? '' : r.score, r.date || '', r.certNo || ''];
    });

  writeTab_('6_Pelanggaran', ['id','kru','tanggal','jenis','tingkat','sp','status','catatan'],
    (d.violations || []), function (v) {
      return [v.id, empName[v.empId] || v.empId, v.date || '', v.type || '',
              v.severity || '', v.sp || '', v.status || '', v.note || ''];
    });

  writeTab_('7_Coaching', ['id','kru','coach','tanggal','masalah','actionPlan','deadline','status'],
    (d.coachings || []), function (c) {
      return [c.id, empName[c.empId] || c.empId, empName[c.coachId] || c.coachId || '',
              c.date || '', c.problem || '', c.actionPlan || '', c.deadline || '', c.status || ''];
    });

  writeTab_('8_Audit', ['waktu','user','aksi','detail'], (d.audit || []), function (a) {
    return [a.at || '', a.userName || '', a.action || '', a.detail || ''];
  });

  // Settings sebagai pasangan field/value agar mudah dibaca.
  var s = d.settings || {};
  var rows = Object.keys(s).map(function (k) { return [k, typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k]]; });
  writeTabRows_('9_Settings', ['field', 'value'], rows);
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

// extra: field tambahan (mis. serverRev/savedBy saat conflict) supaya klien
// bisa memberi tahu SIAPA yang menyimpan duluan, bukan sekadar "gagal".
function err_(msg, extra) {
  var o = { ok: false, error: msg };
  if (extra) for (var k in extra) o[k] = extra[k];
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
