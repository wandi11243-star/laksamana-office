/**
 * Office Identity Layer, Apps Script backend (v3 — TANPA ROLE).
 * Paste into the identity Google Sheet: Extensions -> Apps Script -> replace Code.gs.
 * Then Deploy -> Manage deployments -> edit -> Version: New version (the /exec URL stays the same).
 *
 * PERUBAHAN BESAR DARI v2: kolom `role` dan tab `Roles` DIHAPUS. Akses modul
 * sekarang dipetakan LANGSUNG user -> modul lewat tab Grants.
 *
 * Tabs:
 *   Users   : id | name | pin | active | keterangan
 *   Modules : key | label | active                     (registri modul, dinamis)
 *   Grants  : userId | module | access | grantedBy | ts
 *   Admins  : userId | module                          ('*' = superadmin)
 *
 * Model:
 *   - Grants = satu-satunya sumber "modul apa yang boleh DIBUKA user".
 *     module '*' berarti semua modul di registri Modules. Baris deny
 *     (access FALSE) menimpa '*', jadi "* kecuali howandi_life" bisa ditulis
 *     sebagai dua baris: ('*', TRUE) + ('howandi_life', FALSE).
 *   - Admins = siapa yang boleh membuka konsol "Kelola Akses" INTERNAL sebuah
 *     modul. '*' = semua modul (superadmin). Mengelola sebuah modul TIDAK
 *     otomatis memberi akses membukanya; itu tetap dari Grants.
 *   - DINAMIS: tambah satu baris di Modules -> modul baru langsung bisa
 *     diberikan ke siapa pun, i dan user '*' otomatis dapat.
 *
 * PIN:
 *   - Boleh SAMA antar user. Login memakai name + pin, jadi nama yang
 *     membedakan. TIDAK ADA lagi pengecekan pin unik.
 *   - Tiap user bisa ganti PIN-nya sendiri lewat action `changePin`.
 *
 * Enforcement server-side: setiap tulisan membawa name+pin pemanggil dan
 * diverifikasi ulang di sini. Browser hanya menyembunyikan tombol.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'login':             return login_(body.name, body.pin);
      case 'changePin':         return changePin_(body);      // user mengganti PIN sendiri
      // superadmin only
      case 'listUsers':         return adminListUsers_(body);
      case 'saveUser':          return adminSaveUser_(body);
      case 'deleteUser':        return adminDeleteUser_(body);
      case 'listModules':       return adminListModules_(body);
      case 'syncModules':       return syncModules_(body);   // upsert registri dari BRANCHES app
      case 'saveModule':        return saveModule_(body);    // ubah label / aktif-nonaktif modul
      case 'setAdmin':          return setAdmin_(body);      // angkat/cabut admin modul per user
      // pemberian akses modul (landing "Kelola Akses"): butuh admin '*'
      case 'listAccess':        return listAccess_(body);
      case 'setModuleAccess':   return setModuleAccess_(body);
      // dipakai konsol internal tiap modul untuk tahu SIAPA anggotanya
      case 'listModuleMembers': return listModuleMembers_(body);
      // roster HANYA-BACA sebuah modul, dipakai auto-sync modul (mis. dropdown
      // PIC Marketing) TANPA prompt PIN. Sengaja TANPA gerbang kredensial: yang
      // dikembalikan cuma nama + status aktif + apakah admin modul itu, tidak
      // ada PIN atau data modul lain yang bocor.
      case 'listModuleRoster':  return listModuleRoster_(body);
      default:                  return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ===================== Auth ===================== */

function login_(name, pin) {
  name = String(name || '').trim().toLowerCase();
  pin  = String(pin || '').trim();
  if (!name || !pin) return json_({ ok: false, error: 'missing' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var u = findUserByCreds_(readSheet_(ss, 'Users'), name, pin);
  if (!u) return json_({ ok: false, error: 'invalid' });

  var modules = modulesFor_(ss, u);
  var adminModules = adminModulesFor_(ss, u);
  return json_({ ok: true, user: {
    id: String(u.id || ('u-' + name)),
    name: String(u.name).trim(),
    modules: modules,
    adminModules: adminModules
  }});
}

// Cocokkan name + pin + tidak nonaktif. PIN boleh duplikat antar user karena
// nama ikut jadi kunci.
function findUserByCreds_(users, name, pin) {
  name = String(name).trim().toLowerCase(); pin = String(pin).trim();
  return users.find(function (x) {
    return String(x.name).trim().toLowerCase() === name
        && String(x.pin).trim() === pin
        && String(x.active).toUpperCase() !== 'FALSE';
  }) || null;
}

// User mengganti PIN-nya sendiri. TANPA verifikasi PIN lama: identitas cukup dari
// nama pemilik sesi (user sudah login di Office). PIN baru TIDAK dicek keunikannya:
// tabrakan antar user tidak masalah karena login memakai nama + PIN.
function changePin_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = String(body.name || '').trim().toLowerCase();
  if (!name) return json_({ ok: false, error: 'missing' });

  var next = String(body.newPin || '').trim();
  if (!/^\d{4,8}$/.test(next)) return json_({ ok: false, error: 'bad_pin' });  // 4-8 digit

  var sh = ss.getSheetByName('Users');
  var vals = sh.getDataRange().getValues();
  var col = colMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    var active = String(row[col.active]).toUpperCase() !== 'FALSE';
    if (String(row[col.name]).trim().toLowerCase() === name && active) {
      sh.getRange(i + 1, col.pin + 1).setValue(next);
      return json_({ ok: true });
    }
  }
  return json_({ ok: false, error: 'not_found' });
}

/* ===================== Resolusi akses ===================== */

// Daftar key modul aktif dari registri.
function allModules_(ss) {
  return readSheet_(ss, 'Modules')
    .filter(function (m) { return String(m.active).toUpperCase() !== 'FALSE'; })
    .map(function (m) { return String(m.key || '').trim(); })
    .filter(String);
}

// Modul yang boleh DIBUKA user. Grants adalah satu-satunya sumber.
// '*' diperluas atas registri; baris deny (FALSE) menimpa '*'.
function modulesFor_(ss, user) {
  var uid = String(user.id).trim();
  var grants = readSheet_(ss, 'Grants').filter(function (g) {
    return String(g.userId).trim() === uid;
  });

  var eff = {};
  // 1) '*' lebih dulu, supaya deny spesifik bisa menimpanya.
  grants.forEach(function (g) {
    if (String(g.module).trim() !== '*') return;
    if (String(g.access).toUpperCase() === 'TRUE') {
      allModules_(ss).forEach(function (k) { eff[k] = true; });
    }
  });
  // 2) baris per modul (TRUE = beri, FALSE = cabut).
  grants.forEach(function (g) {
    var m = String(g.module).trim();
    if (!m || m === '*') return;
    if (String(g.access).toUpperCase() === 'TRUE') eff[m] = true;
    else delete eff[m];
  });
  return Object.keys(eff).sort();
}

// Modul yang boleh DIKELOLA (buka konsol Kelola Akses internal). '*' = semua.
function adminModulesFor_(ss, user) {
  var uid = String(user.id).trim();
  return readSheet_(ss, 'Admins')
    .filter(function (a) { return String(a.userId).trim() === uid; })
    .map(function (a) { return String(a.module || '').trim(); })
    .filter(String);
}

/* ===================== Predikat otorisasi ===================== */

// Pemanggil valid DAN mengelola segalanya ('*').
function requireSuperadmin_(ss, body) {
  var caller = findUserByCreds_(readSheet_(ss, 'Users'), body.callerName, body.callerPin);
  if (!caller) return null;
  return adminModulesFor_(ss, caller).indexOf('*') > -1 ? caller : null;
}
// Pemanggil mengelola `module` (atau segalanya).
function requireModuleAdmin_(ss, body, module) {
  var caller = findUserByCreds_(readSheet_(ss, 'Users'), body.callerName, body.callerPin);
  if (!caller) return null;
  var adm = adminModulesFor_(ss, caller);
  return (adm.indexOf('*') > -1 || adm.indexOf(module) > -1) ? caller : null;
}

/* ===================== Users CRUD (superadmin) ===================== */

// Baris Users yang benar-benar berisi user. Tanpa ini, baris kosong / setengah
// kosong di Sheet muncul sebagai user hantu "?" tanpa nama dan PIN.
function realUsers_(ss) {
  return readSheet_(ss, 'Users').filter(function (u) {
    return String(u.id || '').trim() !== '' && String(u.name || '').trim() !== '';
  });
}

function adminListUsers_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var grants = readSheet_(ss, 'Grants');
  var users = realUsers_(ss).map(function (u) {
    return {
      id: String(u.id || ''), name: String(u.name || ''), pin: String(u.pin || ''),
      active: String(u.active).toUpperCase() !== 'FALSE',
      keterangan: String(u.keterangan || ''),
      modules: modulesFor_(ss, u),            // hasil perluasan '*' + deny (untuk ditampilkan)
      grants: rawGrantsFor_(grants, u),       // baris Grants mentah (untuk mengisi centang form)
      adminModules: adminModulesFor_(ss, u)
    };
  });
  return json_({ ok: true, users: users, modules: allModules_(ss) });
}

// Modul yang PUNYA baris grant TRUE untuk user ini, apa adanya ('*' tetap '*').
// Dipakai form Kelola Akses supaya centang mencerminkan Sheet, bukan hasil perluasan.
function rawGrantsFor_(grants, user) {
  var uid = String(user.id).trim();
  return grants
    .filter(function (g) {
      return String(g.userId).trim() === uid
          && String(g.access).toUpperCase() === 'TRUE';
    })
    .map(function (g) { return String(g.module).trim(); })
    .filter(String);
}

// Dipakai form user (hanya modul AKTIF, untuk daftar centang) dan editor modul
// (semua modul + status active). `all:true` -> sertakan yang nonaktif + flag active.
function adminListModules_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var wantAll = body && body.all === true;
  var mods = readSheet_(ss, 'Modules')
    .map(function (m) {
      return {
        key: String(m.key || '').trim(),
        label: String(m.label || '').trim(),
        active: String(m.active).toUpperCase() !== 'FALSE'
      };
    })
    .filter(function (m) { return m.key && (wantAll || m.active); });
  return json_({ ok: true, modules: mods });
}

// Sinkronkan registri Modules dari daftar modul aplikasi (BRANCHES di landing).
// `body.modules` = [{key,label}, ...]. Key yang belum ada DITAMBAH (active TRUE).
// Key yang sudah ada TIDAK diubah (label/active milik admin dipertahankan).
// Tidak pernah MENGHAPUS baris (modul yang dihapus dari app tetap tercatat).
function syncModules_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

  var incoming = Array.isArray(body.modules) ? body.modules : [];
  var sh = ensureSheet_(ss, 'Modules', ['key', 'label', 'active']);
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = colMap_(vals[0]);

  var existing = {};
  for (var i = 1; i < vals.length; i++) existing[String(vals[i][col.key]).trim()] = true;

  var added = [];
  incoming.forEach(function (m) {
    var key = String((m && m.key) || '').trim();
    if (!key || existing[key]) return;
    existing[key] = true;
    var label = String((m && m.label) || key).trim();
    var row = head.map(function (h) {
      return h === 'key' ? key : h === 'label' ? label : h === 'active' ? 'TRUE' : '';
    });
    sh.appendRow(row);
    added.push(key);
  });
  return json_({ ok: true, added: added });
}

// Ubah label dan/atau status aktif satu modul di tab Modules. Key tidak diubah
// (key = identitas modul, dipakai Grants/Admins). Nonaktif = modul disembunyikan
// dari daftar akses tapi baris Grants lama tetap ada.
function saveModule_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

  var key = String(body.key || '').trim();
  if (!key) return json_({ ok: false, error: 'missing_key' });

  var sh = ensureSheet_(ss, 'Modules', ['key', 'label', 'active']);
  var vals = sh.getDataRange().getValues();
  var col = colMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.key]).trim() === key) {
      if (body.label != null && col.label != null) sh.getRange(i + 1, col.label + 1).setValue(String(body.label).trim());
      if (body.active != null && col.active != null)
        sh.getRange(i + 1, col.active + 1).setValue((body.active === true || String(body.active).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE');
      return json_({ ok: true });
    }
  }
  return json_({ ok: false, error: 'not_found' });
}

// Angkat/cabut satu user sebagai admin sebuah modul (tab Admins). module '*' =
// superadmin. access TRUE = pastikan baris ada; FALSE = hapus baris bila ada.
function setAdmin_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var caller = requireSuperadmin_(ss, body);
  if (!caller) return json_({ ok: false, error: 'forbidden' });

  var userId = String(body.userId || '').trim();
  var module = String(body.module || '').trim();
  if (!userId || !module) return json_({ ok: false, error: 'missing_fields' });
  var grant = (body.access === true || String(body.access).toUpperCase() === 'TRUE');

  // Cegah superadmin terakhir mencabut status '*' dirinya sendiri (kunci diri).
  if (module === '*' && !grant && String(caller.id).trim() === userId) {
    var supers = readSheet_(ss, 'Admins').filter(function (a) { return String(a.module).trim() === '*'; });
    if (supers.length <= 1) return json_({ ok: false, error: 'last_superadmin' });
  }

  var sh = ensureSheet_(ss, 'Admins', ['userId', 'module']);
  var vals = sh.getDataRange().getValues();
  var col = colMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.userId]).trim() === userId && String(vals[i][col.module]).trim() === module) {
      if (!grant) sh.deleteRow(i + 1);   // cabut = hapus baris
      return json_({ ok: true });        // sudah ada = tak perlu tambah
    }
  }
  if (grant) {
    var head = vals[0].map(function (h) { return String(h).trim(); });
    sh.appendRow(head.map(function (h) { return h === 'userId' ? userId : h === 'module' ? module : ''; }));
  }
  return json_({ ok: true });
}

// Tambah (tanpa id) atau edit (id ada). Nama wajib unik. PIN TIDAK perlu unik.
function adminSaveUser_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

  var sh = ss.getSheetByName('Users');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = colMap_(vals[0]);

  var name = String(body.name || '').trim();
  var pin  = String(body.pin || '').trim() || '1111';
  var ket  = String(body.keterangan || '').trim();
  var active = body.active === false ? 'FALSE' : 'TRUE';
  if (!name) return json_({ ok: false, error: 'missing_fields' });

  var editId = String(body.id || '').trim();
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][col.id]).trim() === editId) continue;
    if (String(vals[r][col.name]).trim().toLowerCase() === name.toLowerCase())
      return json_({ ok: false, error: 'name_taken' });
    // sengaja TIDAK ada cek pin_taken: PIN boleh sama antar user.
  }

  if (editId) {
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][col.id]).trim() === editId) {
        sh.getRange(i + 1, col.name + 1).setValue(name);
        sh.getRange(i + 1, col.pin + 1).setValue(pin);
        sh.getRange(i + 1, col.active + 1).setValue(active);
        if (col.keterangan != null) sh.getRange(i + 1, col.keterangan + 1).setValue(ket);
        return json_({ ok: true, id: editId });
      }
    }
    return json_({ ok: false, error: 'not_found' });
  }

  var base = 'u-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  var id = base, n = 2, existing = {};
  for (var k = 1; k < vals.length; k++) existing[String(vals[k][col.id]).trim()] = true;
  while (existing[id]) id = base + n++;
  var row = head.map(function (h) {
    return h === 'id' ? id : h === 'name' ? name : h === 'pin' ? pin
      : h === 'active' ? active : h === 'keterangan' ? ket : '';
  });
  sh.appendRow(row);
  return json_({ ok: true, id: id });
}

function adminDeleteUser_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var caller = requireSuperadmin_(ss, body);
  if (!caller) return json_({ ok: false, error: 'forbidden' });

  var sh = ss.getSheetByName('Users');
  var vals = sh.getDataRange().getValues();
  var col = colMap_(vals[0]);
  var id = String(body.id || '').trim();
  if (id && String(caller.id).trim() === id)
    return json_({ ok: false, error: 'cannot_delete_self' });

  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.id]).trim() === id) { sh.deleteRow(i + 1); return json_({ ok: true }); }
  }
  return json_({ ok: false, error: 'not_found' });
}

/* ============ Pemberian akses modul (landing Kelola Akses, superadmin) ============ */

// Matriks user x modul. Hanya superadmin ('*'), sesuai permintaan: pemberian
// akses office hanya lewat halaman landing oleh Admin/Howandi/Wandi.
function listAccess_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var mods = allModules_(ss);
  var users = realUsers_(ss).map(function (u) {
    return {
      id: String(u.id || ''), name: String(u.name || ''),
      keterangan: String(u.keterangan || ''),
      active: String(u.active).toUpperCase() !== 'FALSE',
      modules: modulesFor_(ss, u),
      adminModules: adminModulesFor_(ss, u)
    };
  });
  return json_({ ok: true, users: users, modules: mods });
}

// Upsert baris Grants (userId, module) = access. Superadmin saja.
function setModuleAccess_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var caller = requireSuperadmin_(ss, body);
  if (!caller) return json_({ ok: false, error: 'forbidden' });

  var userId = String(body.userId || '').trim();
  var module = String(body.module || '').trim();
  if (!userId || !module) return json_({ ok: false, error: 'missing_fields' });
  var access = (body.access === true || String(body.access).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';

  var sh = ensureSheet_(ss, 'Grants', ['userId', 'module', 'access', 'grantedBy', 'ts']);
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = colMap_(vals[0]);

  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.userId]).trim() === userId
     && String(vals[i][col.module]).trim() === module) {
      sh.getRange(i + 1, col.access + 1).setValue(access);
      if (col.grantedBy != null) sh.getRange(i + 1, col.grantedBy + 1).setValue(caller.id);
      if (col.ts != null)        sh.getRange(i + 1, col.ts + 1).setValue(new Date().toISOString());
      return json_({ ok: true });
    }
  }
  var row = head.map(function (h) {
    return h === 'userId' ? userId : h === 'module' ? module : h === 'access' ? access
      : h === 'grantedBy' ? caller.id : h === 'ts' ? new Date().toISOString() : '';
  });
  sh.appendRow(row);
  return json_({ ok: true });
}

/* ============ Anggota sebuah modul (dipakai konsol INTERNAL modul) ============ */

// Hanya user yang PUNYA akses ke modul ini. Konsol internal tiap modul memakai
// ini untuk tahu siapa yang boleh diatur hak-halamannya. Tanpa PIN.
// Boleh dipanggil admin modul tsb (atau superadmin).
function listModuleMembers_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var module = String(body.module || '').trim();
  if (!requireModuleAdmin_(ss, body, module)) return json_({ ok: false, error: 'forbidden' });

  var members = realUsers_(ss)
    .map(function (u) {
      return {
        id: String(u.id || ''), name: String(u.name || ''),
        keterangan: String(u.keterangan || ''),
        active: String(u.active).toUpperCase() !== 'FALSE',
        modules: modulesFor_(ss, u)
      };
    })
    .filter(function (u) { return u.modules.indexOf(module) > -1; })   // hanya anggota modul ini
    .map(function (u) { delete u.modules; return u; });

  return json_({ ok: true, members: members });
}

// Roster HANYA-BACA sebuah modul: siapa saja yang boleh membukanya, dan apakah
// dia admin modul itu. Beda dari listModuleMembers_ (khusus konsol Kelola Akses,
// admin-only): ini dipanggil OTOMATIS oleh tiap modul saat boot supaya daftar
// staf (mis. dropdown PIC di Marketing) selalu ikut roster Office, tanpa perlu
// tiap orang login manual dulu atau admin menarik satu-satu. Cukup identitas
// valid (nama+PIN aktif); tidak mengekspos PIN atau modul lain milik user.
function listModuleRoster_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var module = String(body.module || '').trim();
  if (!module) return json_({ ok: false, error: 'missing_module' });
  var members = realUsers_(ss)
    .map(function (u) {
      var adm = adminModulesFor_(ss, u);
      return {
        id: String(u.id || ''), name: String(u.name || ''),
        keterangan: String(u.keterangan || ''),
        active: String(u.active).toUpperCase() !== 'FALSE',
        isModuleAdmin: adm.indexOf('*') > -1 || adm.indexOf(module) > -1,
        modules: modulesFor_(ss, u)
      };
    })
    .filter(function (u) { return u.modules.indexOf(module) > -1; })
    .map(function (u) { delete u.modules; return u; });

  return json_({ ok: true, members: members });
}

/* ===================== Helpers ===================== */

function colMap_(headRow) {
  var col = {};
  headRow.forEach(function (h, i) { var k = String(h).trim(); if (k) col[k] = i; });
  return col;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); }
  return sh;
}

// getDataRange() ikut mengembalikan baris kosong di bawah data (Sheets menganggapnya
// masih "terpakai"). Tanpa filter, tiap baris kosong jadi objek user tanpa id/nama
// dan muncul sebagai user hantu "?" di daftar. Buang baris yang seluruh selnya kosong.
function readSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0].map(function (h) { return String(h).trim(); });
  return vals.slice(1)
    .filter(function (row) {
      return row.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    })
    .map(function (row) {
      var o = {};
      head.forEach(function (h, i) { if (h) o[h] = row[i]; });
      return o;
    });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
