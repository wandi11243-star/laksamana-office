/**
 * Laksamana Office — Apps Script untuk modul AKADEMI (Database Academy)
 * ====================================================================
 * Pasang di: Google Sheet "Database Academy" (Extensions > Apps Script).
 * Deploy: Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Lalu di Akademi: buka Pengaturan > isi "URL Web App" dengan URL /exec ini,
 * dan isi "Kunci" (sync key) yang sama dengan SYNC_KEY di bawah.
 *
 * KONTRAK — mengikuti klien Akademi yang SUDAH ADA (jangan diubah):
 *   GET  ?action=pull&key=...              -> {ok:true, db:{...}}
 *   POST {action:"push", key:"...", db:{}} -> {ok:true}
 *   Error                                  -> {ok:false, error:"..."}
 *
 * Akademi memakai last-write-wins lewat field db.updatedAt: pull hanya dipakai
 * klien bila updatedAt server LEBIH BARU dari lokal. Jadi server cukup menyimpan
 * blob apa adanya.
 *
 * MODEL PENYIMPANAN (standar Office):
 *   _DB       : satu sel JSON blob = SUMBER KEBENARAN
 *   1_Users, 2_Materials, 3_Progress, 4_Programs, 5_Divisions, 6_Activity, 7_Settings
 *             : tab rata, ditulis ulang tiap push. Untuk dibaca manusia & laporan.
 *               JANGAN diedit manual (akan tertimpa). Edit lewat aplikasi.
 */

// Ganti dengan kunci rahasia bebas, lalu isi kunci yang SAMA di Pengaturan Akademi.
// Kalau dikosongkan (''), pemeriksaan kunci dilewati (tidak disarankan).
var SYNC_KEY = 'ganti-kunci-rahasia-akademi';

var DB_SHEET = '_DB';
var DB_CELL  = 'A1';

/* ------------------------------- Router ------------------------------- */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'pull';
    if (action !== 'pull') return err_('unknown_action: ' + action);
    if (!keyOk_(p.key)) return err_('bad_key');
    return okDb_(readDb_());
  } catch (ex) { return err_(String(ex && ex.message || ex)); }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if ((body.action || '') !== 'push') return err_('unknown_action: ' + (body.action || ''));
    if (!keyOk_(body.key)) return err_('bad_key');
    var db = body.db || {};
    writeDb_(db);
    flatten_(db);
    return ok_();
  } catch (ex) { return err_(String(ex && ex.message || ex)); }
}

function keyOk_(k) {
  if (!SYNC_KEY) return true;               // kunci dinonaktifkan
  return String(k || '') === String(SYNC_KEY);
}

/* ---------------------------- Baca / tulis ---------------------------- */
function readDb_() {
  var sh = sheet_(DB_SHEET);
  var raw = String(sh.getRange(DB_CELL).getValue() || '').trim();
  if (!raw) return null;                    // belum ada data: klien pakai seed lokal
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function writeDb_(db) {
  var sh = sheet_(DB_SHEET);
  sh.getRange(DB_CELL).setValue(JSON.stringify(db));
}

/* ------------------------- Tab rata (flatten) -------------------------- */
function flatten_(d) {
  // Kru datang dari Office (SSO). Tidak ada PIN di modul ini.
  writeTab_('1_Users', ['id','name','role','division','title','active','createdAt'],
    (d.users || []), function (u) {
      return [u.id, u.name || '', u.role || '', u.division || '', u.title || '',
              u.active === false ? false : true, u.createdAt || ''];
    });

  writeTab_('2_Materials',
    ['id','type','title','division','cat','mandatory','published','passing','createdAt'],
    (d.materials || []), function (m) {
      return [m.id, m.type || '', m.title || '',
              Array.isArray(m.division) ? m.division.join('|') : (m.division || ''),
              m.cat || '', m.mandatory ? 'WAJIB' : '', m.published ? 'TAYANG' : 'DRAFT',
              m.passing || '', m.createdAt || ''];
    });

  // progress: objek bersarang { userId: { materialId: {...} } } -> diratakan.
  var prog = [];
  var P = d.progress || {};
  Object.keys(P).forEach(function (uid) {
    var byMat = P[uid] || {};
    Object.keys(byMat).forEach(function (mid) {
      var r = byMat[mid] || {};
      prog.push([uid, mid, r.status || '', r.score == null ? '' : r.score,
                 r.passed ? 'LULUS' : '', r.attempts || 0, r.completedAt || r.at || '']);
    });
  });
  writeTabRows_('3_Progress',
    ['userId','materialId','status','score','passed','attempts','completedAt'], prog);

  writeTab_('4_Programs', ['id','bulan','title','deadline','materialIds','note','createdAt'],
    (d.programs || []), function (p) {
      return [p.id, p.bulan || '', p.title || '', p.deadline || '',
              (p.materialIds || []).join('|'), p.note || '', p.createdAt || ''];
    });

  writeTab_('5_Divisions', ['id','name','icon'], (d.divisions || []), function (v) {
    return [v.id, v.name || '', v.icon || ''];
  });

  writeTab_('6_Activity', ['ts','userId','action','detail'], (d.activity || []), function (a) {
    return [a.ts ? new Date(a.ts).toISOString() : '', a.userId || '', a.action || '', a.detail || ''];
  });

  // Settings: jangan bocorkan syncKey ke tab yang dibaca orang.
  var s = d.settings || {};
  var rows = Object.keys(s)
    .filter(function (k) { return k !== 'syncKey'; })
    .map(function (k) { return [k, typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k]]; });
  writeTabRows_('7_Settings', ['field', 'value'], rows);
}

/* ------------------------------ Utilitas ------------------------------ */
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeTab_(name, headers, list, mapFn) {
  writeTabRows_(name, headers, (list || []).map(mapFn));
}

function writeTabRows_(name, headers, rows) {
  var sh = sheet_(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sh.setFrozenRows(1);
}

function ok_() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function okDb_(db) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, db: db }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err_(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
