/**
 * Office Identity Layer, Apps Script backend (v2).
 * Paste into the identity Google Sheet: Extensions -> Apps Script -> replace Code.gs.
 * Then Deploy -> Manage deployments -> edit -> Version: New version (the /exec URL stays the same).
 *
 * Tabs expected:
 *   Users : id | name | pin | role | active | keterangan
 *   Roles : role | label | modules | admin        (admin is the new v2 column)
 *   Grants: userId | module | access | grantedBy | ts   (auto-created if missing)
 *
 * Model (see docs/office-permissions.md):
 *   modules = which modules a user can OPEN. admin = which modules a user MANAGES.
 *   Superadmin = admin contains '*'. Administering a module implies opening it.
 *   Grants override the role baseline per user-per-module (TRUE grant, FALSE deny).
 *
 * Enforcement is server-side: every write carries the caller's own name+pin and is
 * re-verified here. The browser only hides buttons.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'login':             return login_(body.name, body.pin);
      // superadmin only
      case 'listUsers':         return adminListUsers_(body);
      case 'saveUser':          return adminSaveUser_(body);
      case 'deleteUser':        return adminDeleteUser_(body);
      case 'listRoles':         return adminListRoles_(body);
      case 'saveRole':          return adminSaveRole_(body);
      case 'deleteRole':        return adminDeleteRole_(body);
      // module admin (scoped) — used by each module's in-app console (step 3)
      case 'listModuleMembers': return listModuleMembers_(body);
      case 'setModuleAccess':   return setModuleAccess_(body);
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

  var res = resolveFor_(u, readSheet_(ss, 'Roles'), readSheet_(ss, 'Grants'));
  var id = String(u.id || ('u-' + name));
  var role = String(u.role || '').trim().toLowerCase();
  return json_({ ok: true, user: {
    id: id,
    name: String(u.name).trim(),
    role: role,
    modules: res.modules,
    adminModules: res.adminModules,
    // Token SSO untuk modul Laravel (Manajemen/Event Marketing/Finance). Kosong
    // bila SSO_SECRET belum diset di Script Properties.
    ssoToken: generateSsoToken_(String(u.name).trim(), id, role)
  }});
}

// HMAC token untuk SSO ke backend Laravel. Set SSO_SECRET di Project Settings ->
// Script Properties. Tanpa secret, token kosong dan modul SSO tetap aman ditolak.
function generateSsoToken_(name, id, role) {
  var secret = PropertiesService.getScriptProperties().getProperty('SSO_SECRET');
  if (!secret) return '';
  var payload = {
    sub: id, name: name, orole: role,
    iat: new Date().getTime(),
    exp: new Date().getTime() + (24 * 3600 * 1000)   // berlaku 24 jam
  };
  var payloadB64 = b64url_(Utilities.base64Encode(JSON.stringify(payload)));
  var signature = Utilities.computeHmacSha256Signature(payloadB64, secret);
  return payloadB64 + '.' + b64url_(Utilities.base64Encode(signature));
}
function b64url_(b64) { return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// A user row matching name + pin + not inactive, or null.
function findUserByCreds_(users, name, pin) {
  name = String(name).trim().toLowerCase(); pin = String(pin).trim();
  return users.find(function (x) {
    return String(x.name).trim().toLowerCase() === name
        && String(x.pin).trim() === pin
        && String(x.active).toUpperCase() !== 'FALSE';
  }) || null;
}

/* ===================== Access resolution ===================== */

// '*' -> ['*']; 'a,b' -> ['a','b']; '' -> []
function parseList_(raw) {
  raw = String(raw == null ? '' : raw).trim();
  if (raw === '*') return ['*'];
  return raw.split(',').map(function (s) { return s.trim(); }).filter(String);
}
// ['*'] -> '*'; ['a','b'] -> 'a,b'; [] -> ''
function joinList_(arr) {
  arr = arr || [];
  if (arr.indexOf('*') > -1) return '*';
  return arr.join(',');
}

function roleObjFor_(roles, role) {
  role = String(role || '').trim().toLowerCase();
  for (var i = 0; i < roles.length; i++) {
    if (String(roles[i].role).trim().toLowerCase() === role) return roles[i];
  }
  return null;
}

// adminModules for a role. Legacy fallback: if the Roles sheet has no `admin`
// column at all, treat modules '*' as superadmin so nothing breaks pre-migration.
function adminForRole_(roleObj, baseView) {
  if (!roleObj) return [];
  if (!('admin' in roleObj)) return baseView.indexOf('*') > -1 ? ['*'] : [];
  return parseList_(roleObj.admin);
}

// Compute effective { modules, adminModules } for one user, given preloaded
// roles + grants. Pure, so it can run in a loop cheaply.
function resolveFor_(user, roles, grants) {
  var roleObj = roleObjFor_(roles, user.role);
  var baseView = parseList_(roleObj ? roleObj.modules : '');
  var adminMods = adminForRole_(roleObj, baseView);
  if (baseView.indexOf('*') > -1) return { modules: ['*'], adminModules: adminMods, sourceMap: {} };

  var eff = {};
  baseView.concat(adminMods).forEach(function (m) { if (m) eff[m] = 'role'; });
  var uid = String(user.id).trim();
  grants.forEach(function (g) {
    if (String(g.userId).trim() !== uid) return;
    var mod = String(g.module).trim();
    if (String(g.access).toUpperCase() === 'TRUE') eff[mod] = 'grant';
    else delete eff[mod];
  });
  return {
    modules: Object.keys(eff).filter(String).sort(),
    adminModules: adminMods,
    sourceMap: eff
  };
}

/* ===================== Authorization predicates ===================== */

function callerAdminModules_(ss, caller) {
  return resolveFor_(caller, readSheet_(ss, 'Roles'), []).adminModules;
}
// Caller must be a valid user AND administer everything ('*').
function requireSuperadmin_(ss, body) {
  var caller = findUserByCreds_(readSheet_(ss, 'Users'), body.callerName, body.callerPin);
  if (!caller) return null;
  return callerAdminModules_(ss, caller).indexOf('*') > -1 ? caller : null;
}
// Caller must administer `module` (or everything).
function requireModuleAdmin_(ss, body, module) {
  var caller = findUserByCreds_(readSheet_(ss, 'Users'), body.callerName, body.callerPin);
  if (!caller) return null;
  var adm = callerAdminModules_(ss, caller);
  return (adm.indexOf('*') > -1 || adm.indexOf(module) > -1) ? caller : null;
}

/* ===================== Users CRUD (superadmin) ===================== */

function adminListUsers_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var users = readSheet_(ss, 'Users').map(function (u) {
    return {
      id: String(u.id || ''), name: String(u.name || ''), pin: String(u.pin || ''),
      role: String(u.role || ''), active: String(u.active).toUpperCase() !== 'FALSE',
      keterangan: String(u.keterangan || '')
    };
  });
  var roles = readSheet_(ss, 'Roles').map(function (r) { return String(r.role || '').trim(); })
              .filter(String);
  return json_({ ok: true, users: users, roles: roles });
}

// Add (no id) or edit (id present). Unique name + PIN. active:false = deactivate.
function adminSaveUser_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

  var sh = ss.getSheetByName('Users');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = {}; head.forEach(function (h, i) { col[h] = i; });

  var name = String(body.name || '').trim();
  var pin  = String(body.pin || '').trim();
  var role = String(body.role || '').trim().toLowerCase();
  var ket  = String(body.keterangan || '').trim();
  var active = body.active === false ? 'FALSE' : 'TRUE';
  if (!name || !pin || !role) return json_({ ok: false, error: 'missing_fields' });

  var editId = String(body.id || '').trim();
  for (var r = 1; r < vals.length; r++) {
    var rid = String(vals[r][col.id]).trim();
    if (rid === editId) continue;
    if (String(vals[r][col.name]).trim().toLowerCase() === name.toLowerCase())
      return json_({ ok: false, error: 'name_taken' });
    if (String(vals[r][col.pin]).trim() === pin)
      return json_({ ok: false, error: 'pin_taken' });
  }

  if (editId) {
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][col.id]).trim() === editId) {
        sh.getRange(i + 1, col.name + 1).setValue(name);
        sh.getRange(i + 1, col.pin + 1).setValue(pin);
        sh.getRange(i + 1, col.role + 1).setValue(role);
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
      : h === 'role' ? role : h === 'active' ? active : h === 'keterangan' ? ket : '';
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
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = {}; head.forEach(function (h, i) { col[h] = i; });
  var id = String(body.id || '').trim();
  if (id && String(caller.id).trim() === id)
    return json_({ ok: false, error: 'cannot_delete_self' });

  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.id]).trim() === id) { sh.deleteRow(i + 1); return json_({ ok: true }); }
  }
  return json_({ ok: false, error: 'not_found' });
}

/* ===================== Roles CRUD (superadmin) ===================== */

function adminListRoles_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var roles = readSheet_(ss, 'Roles').map(function (r) {
    var baseView = parseList_(r.modules);
    return {
      role: String(r.role || '').trim(),
      label: String(r.label || '').trim(),
      modules: baseView,
      admin: adminForRole_(r, baseView)
    };
  }).filter(function (r) { return r.role; });
  return json_({ ok: true, roles: roles });
}

// Upsert. Edit is keyed by `orig` (the previous role key); add has empty `orig`.
function adminSaveRole_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

  var role = String(body.role || '').trim().toLowerCase();
  if (!role) return json_({ ok: false, error: 'missing_role' });
  var orig = String(body.orig || '').trim().toLowerCase();
  var label = String(body.label || '').trim();
  var modulesCell = joinList_(body.modules || []);
  var adminCell = joinList_(body.admin || []);

  var sh = ss.getSheetByName('Roles');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = {}; head.forEach(function (h, i) { col[h] = i; });
  if (col.admin == null) return json_({ ok: false, error: 'no_admin_column' });

  for (var r = 1; r < vals.length; r++) {
    var rk = String(vals[r][col.role]).trim().toLowerCase();
    if (rk === role && rk !== orig) return json_({ ok: false, error: 'role_taken' });
  }

  if (orig) {
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][col.role]).trim().toLowerCase() === orig) {
        sh.getRange(i + 1, col.role + 1).setValue(role);
        if (col.label != null)   sh.getRange(i + 1, col.label + 1).setValue(label);
        if (col.modules != null) sh.getRange(i + 1, col.modules + 1).setValue(modulesCell);
        sh.getRange(i + 1, col.admin + 1).setValue(adminCell);
        return json_({ ok: true });
      }
    }
    return json_({ ok: false, error: 'not_found' });
  }

  var row = head.map(function (h) {
    return h === 'role' ? role : h === 'label' ? label
      : h === 'modules' ? modulesCell : h === 'admin' ? adminCell : '';
  });
  sh.appendRow(row);
  return json_({ ok: true });
}

function adminDeleteRole_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireSuperadmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
  var role = String(body.role || '').trim().toLowerCase();
  if (role === 'superadmin') return json_({ ok: false, error: 'cannot_delete_superadmin' });

  var inUse = readSheet_(ss, 'Users').some(function (u) {
    return String(u.role || '').trim().toLowerCase() === role;
  });
  if (inUse) return json_({ ok: false, error: 'role_in_use' });

  var sh = ss.getSheetByName('Roles');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = {}; head.forEach(function (h, i) { col[h] = i; });
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][col.role]).trim().toLowerCase() === role) { sh.deleteRow(i + 1); return json_({ ok: true }); }
  }
  return json_({ ok: false, error: 'not_found' });
}

/* ===================== Module access (module admin, scoped) ===================== */

// List Office users with their access status for one module. No PINs. Used by the
// per-module "Kelola Akses" console (step 3).
function listModuleMembers_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var module = String(body.module || '').trim();
  if (!requireModuleAdmin_(ss, body, module)) return json_({ ok: false, error: 'forbidden' });

  var roles = readSheet_(ss, 'Roles');
  var grants = readSheet_(ss, 'Grants');
  var members = readSheet_(ss, 'Users').map(function (u) {
    var res = resolveFor_(u, roles, grants);
    var all = res.modules.indexOf('*') > -1;
    var has = all || res.modules.indexOf(module) > -1;
    var source = all ? 'role' : (res.sourceMap[module] || (has ? 'role' : 'none'));
    return {
      id: String(u.id || ''), name: String(u.name || ''),
      keterangan: String(u.keterangan || ''),
      active: String(u.active).toUpperCase() !== 'FALSE',
      access: has, source: source   // 'role' | 'grant' | 'none'
    };
  });
  return json_({ ok: true, members: members });
}

// Upsert a Grants row (userId, module) = access. Creates the Grants tab if missing.
function setModuleAccess_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var module = String(body.module || '').trim();
  var caller = requireModuleAdmin_(ss, body, module);
  if (!caller) return json_({ ok: false, error: 'forbidden' });

  var userId = String(body.userId || '').trim();
  if (!userId || !module) return json_({ ok: false, error: 'missing_fields' });
  var access = (body.access === true || String(body.access).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';

  var sh = ensureGrantsSheet_(ss);
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  var col = {}; head.forEach(function (h, i) { col[h] = i; });

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

function ensureGrantsSheet_(ss) {
  var sh = ss.getSheetByName('Grants');
  if (!sh) { sh = ss.insertSheet('Grants'); sh.appendRow(['userId', 'module', 'access', 'grantedBy', 'ts']); }
  return sh;
}

/* ===================== Helpers ===================== */

function readSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0].map(function (h) { return String(h).trim(); });
  return vals.slice(1).map(function (row) {
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
