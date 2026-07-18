# Office Identity Layer

Office (`office.laksamanamuda.id`) is the identity layer for the whole ecosystem. It owns authentication, the user list, and coarse-grained authorization (which modules a user may open). Modules own their own business logic and fine-grained features.

Flow: `Login → Office → Module`. A user signs in once. Every module reads the shared session instead of running its own login.

This works because every module lives on the same origin, so they share `localStorage`. No OAuth or token exchange is needed, only a shared session convention.

> Trust model: this is client-side authorization. It hides modules a user should not use and removes the per-module logins, but a determined user can edit `localStorage`. Real data enforcement, if ever needed, must live server-side (in the Apps Script or wherever the data is). Design the model now so enforcement can slot in later without a rewrite.

---

## 1. The session contract (`lm_session`)

Office writes one object to `localStorage` under the key `lm_session`. This is the API between Office and every module. Do not change its shape without updating all modules.

```json
{
  "v": 1,
  "userId": "u-christy",
  "name": "Christy",
  "role": "marketing",
  "modules": ["konten", "reservasi"],
  "issuedAt": 1752000000000,
  "expiry": 1752086400000
}
```

- `modules` is the resolved list of module keys the user may open. The single value `["*"]` means all modules (owner/admin).
- `expiry` is epoch ms. A session past expiry is treated as absent.

### Module keys are leaf apps, not folders

The keys are the actual apps a person enters, not the launcher grouping:

- `ordering`, `purchasing` (the two panels inside the **Stock** folder, at `deploy/stock/ordering/` and `deploy/stock/purchasing/`)
- `konten`
- `reservasi`

The Office launcher's **Stock** card (key `stock`, folder `deploy/stock/`) is a group: it appears if the user may open `ordering` OR `purchasing` (see the card's `access` array). Someone with only `ordering` reaches the Ordering panel; the Stock picker then skips straight into it instead of asking. This is how a role gets one panel but not the other.

Naming note: the folder `stock/kitchen/` was renamed to `stock/ordering/` and its module key `kitchen` to `ordering`. In the Sheet `Roles` tab, any role that used to grant module `kitchen` must now list `ordering`. Role NAMES (e.g. a `kitchen` role) are unaffected, only the module KEY changed. Purchasing's key stayed `purchasing`.

---

## 2. The identity store (Google Sheet)

Two tabs in one spreadsheet.

**Tab `Users`**

| id | name | pin | role | active | keterangan |
|----|------|-----|------|--------|------------|
| u-christy | Christy | 4821 | marketing | TRUE | Marketing |
| u-putra | Putra | 1111 | kitchen | TRUE | Kitchen |
| u-owner | Bagas | 9000 | owner | TRUE | Owner |

**Tab `Roles`** (maps a role to the module keys it can open; `*` means all; comma-separate multiple)

| role | label | modules |
|------|-------|---------|
| owner | Owner | * |
| admin | Administrator | * |
| kitchen | Kitchen Staff | kitchen |
| purchasing | Purchasing | purchasing |
| konten | Content Staff | konten |
| host | Reservasi Host | reservasi |
| marketing | Marketing | konten,reservasi |
| cashier | Cashier | reservasi |
| reservasi | Reservasi Staff | reservasi |

For a person who needs both Ordering panels, give their role `kitchen,purchasing`.

Roles are the stable interface. Office knows roles and module keys, never a module's internal features. Adding a module means adding one row here (and one entry in the Office `BRANCHES` registry). Changing what a role can do inside a module is the module's job, not this sheet's.

---

## 3. Apps Script (server-side verification)

In the spreadsheet, open Extensions, Apps Script, paste this, then Deploy as a Web App (Execute as: Me, Who has access: Anyone). Copy the `/exec` URL into `OFFICE_WEBAPP_URL` in `deploy/index.html`.

```javascript
function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'login':      return login_(body.name, body.pin);
      case 'listUsers':  return adminListUsers_(body);
      case 'saveUser':   return adminSaveUser_(body);
      case 'deleteUser': return adminDeleteUser_(body);
      default:           return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---- Auth ----------------------------------------------------------------

function login_(name, pin) {
  name = String(name || '').trim().toLowerCase();
  pin  = String(pin || '').trim();
  if (!name || !pin) return json_({ ok: false, error: 'missing' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var u = findUserByCreds_(readSheet_(ss, 'Users'), name, pin);
  if (!u) return json_({ ok: false, error: 'invalid' });

  var role = String(u.role || '').trim().toLowerCase();
  var ssoToken = generateSsoToken_(u.name, String(u.id || ('u-' + name)), role);
  
  return json_({ ok: true, user: {
    id: String(u.id || ('u-' + name)),
    name: String(u.name).trim(),
    role: role,
    modules: modulesForRole_(readSheet_(ss, 'Roles'), role),
    ssoToken: ssoToken
  }});
}

function generateSsoToken_(name, id, role) {
  var secret = PropertiesService.getScriptProperties().getProperty('SSO_SECRET');
  if (!secret) return '';
  
  var payload = {
    sub: id,
    name: name,
    orole: role,
    iat: new Date().getTime(),
    exp: new Date().getTime() + (24 * 3600 * 1000) // Berlaku 24 jam
  };
  
  var payloadB64 = b64url_(Utilities.base64Encode(JSON.stringify(payload)));
  var signature = Utilities.computeHmacSha256Signature(payloadB64, secret);
  var signatureB64 = b64url_(Utilities.base64Encode(signature));
  
  return payloadB64 + '.' + signatureB64;
}

function b64url_(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A user row matching name + pin + not inactive, or null.
function findUserByCreds_(users, name, pin) {
  name = String(name).trim().toLowerCase(); pin = String(pin).trim();
  return users.find(function (x) {
    return String(x.name).trim().toLowerCase() === name
        && String(x.pin).trim() === pin
        && String(x.active).toUpperCase() !== 'FALSE';
  }) || null;
}

function modulesForRole_(roles, role) {
  var raw = '';
  roles.forEach(function (r) {
    if (String(r.role).trim().toLowerCase() === role) raw = String(r.modules || '').trim();
  });
  return raw === '*' ? ['*']
    : raw.split(',').map(function (s) { return s.trim(); }).filter(String);
}

// Every admin action carries the caller's own name+pin. Verify the caller is an
// owner/admin (resolves to modules '*') before doing anything. There is no
// session on Apps Script, so this re-check IS the enforcement.
function requireAdmin_(ss, body) {
  var caller = findUserByCreds_(readSheet_(ss, 'Users'),
                                body.callerName, body.callerPin);
  if (!caller) return null;
  var mods = modulesForRole_(readSheet_(ss, 'Roles'),
                             String(caller.role || '').trim().toLowerCase());
  return mods.indexOf('*') > -1 ? caller : null;
}

// ---- Admin: Users CRUD ---------------------------------------------------

function adminListUsers_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireAdmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });
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

// Add (no id) or edit (id present) one user. Enforces unique name and unique PIN.
function adminSaveUser_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!requireAdmin_(ss, body)) return json_({ ok: false, error: 'forbidden' });

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
  // Uniqueness checks against every other row.
  for (var r = 1; r < vals.length; r++) {
    var rid = String(vals[r][col.id]).trim();
    if (rid === editId) continue;
    if (String(vals[r][col.name]).trim().toLowerCase() === name.toLowerCase())
      return json_({ ok: false, error: 'name_taken' });
    if (String(vals[r][col.pin]).trim() === pin)
      return json_({ ok: false, error: 'pin_taken' });
  }

  if (editId) {                                   // edit existing row
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

  // add new row: id = u-<slug of name>, de-duplicated
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
  var caller = requireAdmin_(ss, body);
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

// ---- Helpers -------------------------------------------------------------

function readSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0].map(function (h) { return String(h).trim(); });
  return vals.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

The browser sends every request as a `text/plain` POST, which avoids a CORS preflight while keeping PINs out of the URL. Login returns only the matched user. Admin actions (`listUsers`, `saveUser`, `deleteUser`) each carry the caller's own `callerName` + `callerPin`; the script re-verifies that caller is an owner/admin before touching the sheet, so a hand-crafted request from a non-admin is rejected server-side. `saveUser` enforces unique name and unique PIN; `deleteUser` refuses to delete the caller's own account.

**Redeploy after pasting:** Apps Script serves a fixed version, so after replacing the code you must Deploy > Manage deployments > edit > Version: New version, or the new actions 404. The `/exec` URL stays the same.

---

## 4. How modules integrate

Every module gets a small **SSO head guard** as the first script in `<head>`, so an unauthenticated or unauthorized visitor is bounced to Office before the page renders (no flash of the old login):

```html
<script>
(function(){try{var s=JSON.parse(localStorage.getItem('lm_session')||'null');
  var ok=s&&s.expiry&&Date.now()<s.expiry&&(s.modules||[]).some(function(m){return m==='*'||m==='THIS_KEY';});
  if(!ok)location.replace('PATH_TO_OFFICE');}catch(e){location.replace('PATH_TO_OFFICE');}})();
</script>
```

`THIS_KEY` is the module key (`kitchen`, `purchasing`, `konten`, `reservasi`). `PATH_TO_OFFICE` is `../../` for the ordering sub-apps, `../` for konten/reservasi. The module then reads `lm_session` for identity and **maps the Office role to its own internal role**. Two patterns exist, pick by how the module models permissions:

**Pattern A, simple role map (used by kitchen and purchasing).** The module has a couple of internal roles. Map directly, no user list needed:

```javascript
function officeUser(){
  const s = JSON.parse(localStorage.getItem('lm_session'));
  if(!s || !s.expiry || Date.now()>s.expiry) return null;
  const m = s.modules||[];
  if(!(m.includes('*') || m.includes('kitchen'))) return null;          // this module's key
  const role = (s.role==='owner'||s.role==='admin') ? 'admin' : 'full'; // office role -> internal
  return { id:s.userId, name:s.name, role:role };
}
```

**Pattern B, resolve against the module's own crew list (used by konten).** The module owns a rich role catalog. Match the Office identity to an existing crew member by id then name; provision a newcomer in-memory with a default role mapped from the Office role. The owner refines roles inside the module's own crew screen:

```javascript
function resolveUser(s){
  let u = DB.users.find(x=>x.id===s.userId)
        || DB.users.find(x=>x.name.toLowerCase()===String(s.name).toLowerCase());
  if(!u){ u = { id:s.userId, name:s.name, roles:mapOfficeRole(s.role) }; DB.users.push(u); }
  return u;
}
```

In both, **logout is a single sign-out**: clear `lm_session` (and any legacy key) and redirect to Office. The old login screens and seed user lists become dead code, left in place to keep the change low-risk.

Modules depend only on this contract, never importing Office code or knowing about other modules.

### Migration status

| Module | Status | Notes |
|--------|--------|-------|
| ordering (kitchen, purchasing) | Done | Pattern A. Office role owner/admin maps to internal `admin`, else `full`. Panel-level keys `kitchen` / `purchasing`. In-app "Kelola User" hidden (identity is Office/Sheet now). |
| konten (COMS) | Done | Pattern B. `OFFICE_TO_KONTEN_ROLES` maps owner/admin to `super_admin`, else `content_planner`. Newcomers auto-provisioned in-memory; owner sets permanent roles in Kelola Kru. |
| reservasi | Done | Pattern B. `OFFICE_TO_RESERVASI_ROLE` maps owner/admin -> `admin`, manager -> `manager`, host/cashier/marketing pass through, unmapped roles default to `host`. Newcomers provisioned in-memory into `STATE.master.users`; manager/admin sets permanent roles in Master Data. |
