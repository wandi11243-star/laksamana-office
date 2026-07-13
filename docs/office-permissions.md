# Office Permissions Redesign (Discord-style)

Status: **Design proposal, not yet built.** Supersedes the single-`*`-admin model once approved. Companion to [office-auth.md](office-auth.md); that doc describes the current (v1) identity layer, this doc describes the target (v2).

The goal: manage all users, roles, and per-module access **from the web**, with a superadmin over everything and a separate admin per module, the way Discord has a server administrator plus per-channel moderators.

---

## 1. The core idea: two capability axes

Today one flag (`modules: *`) does three jobs at once: open everything, see Kelola User, and write to the Sheet. We split the single overloaded flag into **two independent axes**, both defined per role:

| Axis | Question it answers | Discord analogy |
|------|--------------------|-----------------|
| **view** (`modules`) | which modules can this person **open**? | which channels can you **see**? |
| **admin** (`admin`) | which modules can this person **manage** (users + access within)? | which channels do you **moderate**? |

- **Superadmin** = `admin` is `*`. Opens everything, sees the landing "Kelola User" button, manages the global user list **and** the role catalog.
- **Module admin** = `admin` is e.g. `konten`. Manages konten (and only konten) from inside that module. Can still be a plain member of other modules.
- **Member** = `admin` empty. Just opens whatever `modules` grants.

Rule: **administering a module implies opening it.** If your role administers `konten`, you can open `konten` even if it is not in your `modules` list.

Beyond roles, individuals need exceptions (Discord per-member channel overrides). That is the third tab below.

---

## 2. Sheets schema (the important part)

Three tabs, normalized. The design principle: **adding a new module never changes the schema**, you just start using its key. Roles stay a small human-readable vocabulary; individual exceptions live in their own tab so multiple module admins never fight over the same cell.

### Tab `Users` (identity: who exists) — unchanged from today

| id | name | pin | role | active | keterangan |
|----|------|-----|------|--------|------------|
| u-bagas | Bagas | 9000 | superadmin | TRUE | Owner |
| u-christy | Christy | 4821 | marketing | TRUE | Marketing |
| u-rangga | Rangga | 3310 | konten_admin | TRUE | Content Lead |
| u-putra | Putra | 1111 | kitchen | TRUE | Kitchen |

One person, one baseline `role`. PIN is the credential. Nothing here changes.

### Tab `Roles` (presets: what a role can do) — add one column

| role | label | modules | admin |
|------|-------|---------|-------|
| superadmin | Super Admin | `*` | `*` |
| konten_admin | Konten Admin | konten,akademi | konten |
| marketing | Marketing | konten,reservasi | |
| kitchen | Kitchen Staff | kitchen,akademi | |
| host | Reservasi Host | reservasi | |

- `modules`: baseline modules this role opens. `*` = all. Comma-separated.
- `admin` (**new**): modules this role administers. `*` = superadmin. Comma-separated. Empty = plain member.
- `label`: human name shown in the UI.

`konten_admin` above opens konten + akademi as a member, and administers konten. `marketing` opens konten + reservasi, administers nothing.

### Tab `Grants` (**new** — per-user exceptions, this is where module admins write)

| userId | module | access | grantedBy | ts |
|--------|--------|--------|-----------|-----|
| u-christy | akademi | TRUE | u-rangga | 2026-07-11T… |
| u-putra | konten | FALSE | u-rangga | 2026-07-11T… |

One row per user-per-module override. It **wins over** the role baseline:

- `access = TRUE`: grant this user this module even if their role does not.
- `access = FALSE`: revoke this module even if their role grants it (a Discord "deny" override).
- `grantedBy` / `ts`: audit trail (who changed it, when).

Why a separate long-format tab instead of extra columns on `Users`:

1. **No schema churn.** New module = new `module` value, never a new column.
2. **Conflict-free multi-admin writes.** A konten admin only ever touches rows where `module = konten`; a reservasi admin only touches `module = reservasi`. They never overwrite each other's cells. If grants were a comma-list cell on `Users`, two admins editing the same person would clobber each other.
3. **Clean server-side authorization boundary.** "You may write a `Grants` row only if `module` is in your adminModules" is a one-line rule. This is the real enforcement (see section 5).
4. **Auditability.** Every exception is a dated row, not an opaque edit to a shared cell.

Trade-off: computing a person's effective access needs a small join across the three tabs. At ~50 users this is nothing, and it is done once at login.

> Forward-compatible: if you later want per-**user** module admins (not just per-role), add one `admin` column to `Grants` (TRUE/FALSE per user-module). No other change. We are not building that now because you chose per-role admin scope, but the schema leaves the door open.

---

## 3. How access is resolved (login time)

For a user logging in:

```
role        = Users[user].role
baseView    = Roles[role].modules        // e.g. ['konten','reservasi'] or ['*']
adminMods   = Roles[role].admin          // e.g. ['konten'] or ['*'] or []
grants      = Grants where userId = user  // per-module TRUE/FALSE

// administering a module implies opening it
effective   = baseView ∪ adminMods
// apply per-user overrides
for each grant:
    if grant.access == TRUE:  effective += grant.module
    if grant.access == FALSE: effective -= grant.module   // deny wins

modules       = (baseView has '*') ? ['*'] : effective
adminModules  = adminMods                                  // ['*'] = superadmin
```

`deny` always wins over a role grant, matching Discord's "explicit deny beats allow." Superadmin (`modules: *`) ignores denies (they open everything by definition).

---

## 4. Session contract v2 (`lm_session`)

Add one field, bump the version. Backward-compatible: existing modules read `modules` + `expiry` and ignore the rest.

```json
{
  "v": 2,
  "userId": "u-rangga",
  "name": "Rangga",
  "role": "konten_admin",
  "modules": ["konten", "akademi"],
  "adminModules": ["konten"],
  "issuedAt": 1752000000000,
  "expiry": 1752086400000
}
```

- `modules`: the **resolved effective** list (role baseline + admin-implies-view + grants). `["*"]` = all.
- `adminModules` (**new**): modules this person administers. `["*"]` = superadmin, `[]` = none.

---

## 5. Apps Script API (server-side enforcement)

The browser only hides buttons; the Sheet is the real gate. Every write still carries the caller's `callerName` + `callerPin` and the script re-verifies. Two authorization predicates:

- `requireSuperadmin_(caller)` → caller's adminModules includes `*`.
- `requireModuleAdmin_(caller, module)` → caller's adminModules includes `*` **or** `module`.

### Action authorization matrix

| Action | Who may call | Returns / effect |
|--------|-------------|------------------|
| `login` | anyone with valid creds | own identity: modules + adminModules |
| `listUsers` | superadmin | all users incl. PINs + role catalog |
| `saveUser` | superadmin | create/edit an account (name, pin, role, active). Setting `active = FALSE` is the normal way to remove someone. |
| `deleteUser` | superadmin | hard-delete a row (rare; never self). Prefer deactivate. |
| `listRoles` | superadmin | role catalog (role, label, modules, admin) |
| `saveRole` | superadmin | create/edit a role |
| `deleteRole` | superadmin | delete a role (refused if any user still has it) |
| `listModuleMembers` | admin of `module` | users + their access status for that module. **No PINs.** |
| `setModuleAccess` | admin of `module` | upsert a `Grants` row `{userId, module, access}` |

Key boundaries this enforces:

- Only superadmin creates login accounts or edits the role catalog. Module admins cannot mint accounts or invent roles.
- A module admin's reach is hard-capped to their module(s): `setModuleAccess` for a module you do not administer is rejected server-side, even with a hand-crafted request.
- Module admins never see PINs. PINs are identity, superadmin territory.

### The full script

The complete, ready-to-paste backend is **[office-apps-script.gs](office-apps-script.gs)**. It implements every action above, the two predicates, `Grants`-aware login, and auto-creates the `Grants` tab if missing. Paste it over `Code.gs` in the Sheet and redeploy a new version.

Backward-compat during rollout: if the `admin` column does not exist yet, the script falls back to the legacy rule (`modules == *` means superadmin), so login keeps working between pasting the code and finishing the migration. `saveRole` returns `no_admin_column` until you add the column, a clear "finish the migration" signal.

---

## 6. Landing console (superadmin only)

Changes to `deploy/index.html`:

1. **Button visibility.** "Kelola User" shows only when `adminModules` includes `*`. Module admins never see it (they manage inside their module, section 7).
2. **Hard PIN lock.** PIN is verified **before** the panel renders. Wrong PIN → the panel never opens (today it opens and shows an error but still lets you interact, that hole is closed). Flow: click → PIN prompt → `login`-verify the PIN belongs to a superadmin → only then build and show the panel.
3. **Two tabs inside the console:**
   - **Users**: add/edit accounts and assign a role. The primary "remove" action is **Deactivate** (`active = FALSE`), which keeps the row, its audit history, and any `Grants` references intact. Hard delete is a rare, confirmed action tucked away, not the default button.
   - **Roles** (new): CRUD the role catalog. Each role has a label, a module picker for `modules`, and a module picker for `admin`. This is how a superadmin creates "Konten Admin" without touching the Sheet. `superadmin` is the reserved role whose `admin` is `*`.

---

## 7. Per-module admin surface (one unified console inside each module)

Module admins do not see the landing button. Instead, each module's **existing** management screen (konten's Kelola Kru, reservasi's Master Data, akademi's Kelola Kru) becomes the module admin's console, unlocked when `adminModules` includes that module (or `*`). We do **not** add a separate "Kelola Akses" screen. The same admin owns both layers, so they live in one place:

- **Coarse (Office membership):** who has access to this module. A toggle per Office user; flipping it upserts a `Grants` row via the Office Apps Script (`listModuleMembers`, `setModuleAccess`). Modules already fetch `script.google.com` at login, so this reuses the same channel; the module just needs `OFFICE_WEBAPP_URL`.
- **Fine (in-module roles):** the module's own rich role/feature assignment, its existing store (konten's crew roles, reservasi's Master Data), unchanged in mechanism.

One screen, one mental model: "manage who is in my module and what they do here." The two layers still write to two backends (Office Sheet `Grants` vs the module's own store), that is an implementation detail behind a single UI.

**Provisioning seam:** to set a fine role for someone before they have ever logged in, the module record must exist. When the admin grants Office access (coarse), the console also provisions that person's in-module crew record with a default role (extending the Pattern B lazy-provisioning that already runs at login). So granting access and assigning a role happen in the same flow, no dead-ends.

**Grant/deny behind an advanced toggle:** the default view shows the roster and each person's effective access (on/off, and whether it comes from their role or an override). The per-user override controls (grant-extra and deny/revoke) are tucked behind an "Atur pengecualian" (manage exceptions) advanced toggle, so the common case (access follows from the role) stays uncluttered and exceptions are opt-in.

This has two parts:

- **Part A, admin elevation (DONE).** Each module now reads `adminModules` from `lm_session` and, when it covers that module (or `*`), grants the user the module's internal admin role for the session (without mutating stored data). This unlocks the module's **existing** management screen (konten Kelola Kru, reservasi Master Data, ordering/purchasing Kelola User + Config, akademi Kelola Kru). This is what makes "a per-module admin manages roles and users in that specific module" real. Implemented in all five module apps and verified in-browser.
- **Part B, coarse Office-membership granting (remaining, optional).** The same screen also lets a module admin grant/revoke Office-level access to their module for existing users (writes `Grants` via `setModuleAccess`/`listModuleMembers`, both already in the Apps Script), with the grant/deny override behind an advanced toggle and provisioning-on-grant. Until Part B ships, adding a new person to a module is the superadmin's job in the landing console. Part B can be added per module when wanted.

Note: Part B is the heaviest remaining piece (a new panel per module + an Office-backend client). Sections 1–6 + Part A deliver superadmin and functional per-module admins.

---

## 8. Migration (one-time, in the Sheet)

The `Users` and `Roles` tabs already have all their v1 columns (`Roles` already has `role, label, modules`). The **only** structural additions are one column and one tab.

1. **Roles tab**: add one new column header `admin` (to the right of `modules`). Then:
   - On your owner row, set `role = superadmin`, `modules = *`, `admin = *`. (Drop the separate `owner`/`admin` roles, or repurpose one as `superadmin`.)
   - Existing member roles: leave `admin` blank.
   - Add module-admin roles as needed, e.g. `konten_admin` with `modules = konten,akademi` and `admin = konten`.
2. **Grants tab**: optional to pre-create (the script makes it on first use). To create by hand, add a tab named `Grants` with headers `userId, module, access, grantedBy, ts` and leave it empty.
3. **Users tab**: no column change. Set the owner's `role` to `superadmin`, and reassign anyone who should be a module admin to the matching new role.
4. **Apps Script**: paste [office-apps-script.gs](office-apps-script.gs) over `Code.gs`, then Deploy → Manage deployments → edit → Version: **New version** (the `/exec` URL stays the same). Until this redeploy, the new actions 404.
5. **Landing**: deploy the updated `deploy/index.html` (step 1, already built).

Order is forgiving: the Apps Script legacy fallback keeps v1 login working throughout, so there is no hard downtime. Do step 4 (paste script) before relying on the Role tab.

---

## 9. Trust model (unchanged principle)

This is still client-gated + server-enforced. The browser hides what you cannot use; the Apps Script is where "can this caller actually do this" is decided. The new per-module boundary (`requireModuleAdmin_`) is real server-side enforcement, so a module admin genuinely cannot escalate beyond their module even by crafting requests. PINs remain out of `localStorage` and out of module-admin views.

---

## 10. Decisions (resolved 2026-07-11)

1. **Naming**: standardize on a single `superadmin` role (`modules=*`, `admin=*`). Drop `owner`/`admin` as top-authority role names.
2. **Module-admin console**: lives **inside each module**, and is the module's **existing** management screen (not a separate "Kelola Akses" and not a landing console). It gains the coarse Office-membership layer on top of the fine in-module roles it already handles. See section 7.
3. **Grant/deny UI**: both the grant-extra and deny/revoke override controls sit behind an advanced "manage exceptions" toggle. The default view is the simple roster + effective-access status.
4. **Remove = deactivate**: `active = FALSE` is the default way to remove a user (keeps audit + `Grants` intact). Hard delete is a rare, tucked-away action.

## 11. Proposed build order

1. **Session v2 + landing superadmin console** (`deploy/index.html`): superadmin-only button, hard PIN lock, Users tab with deactivate-default, new Roles tab. Fully browser-testable.
2. **Extended Apps Script** (`Code.gs` in the Sheet): resolve `adminModules` + apply `Grants` at login; add roles CRUD and the scoped `listModuleMembers`/`setModuleAccess`; legacy fallback. You paste and redeploy.
3. **Per-module unified console** (each module): existing management screen gains the coarse-access layer + Office-backend client + provisioning-on-grant + advanced exceptions toggle.
