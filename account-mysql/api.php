<?php
/************************************************************************
 * ACCOUNT — Endpoint API (daftar user & hak akses Office)
 * ---------------------------------------------------------------------
 * Menggantikan Web App Apps Script. Nama aksi, bentuk balasan, dan kode
 * error-nya SAMA PERSIS, jadi frontend cukup mengganti URL-nya.
 *
 * Semua aksi lewat POST JSON (frontend mengirim Content-Type text/plain
 * supaya tidak memicu preflight CORS — sama seperti sebelumnya):
 *
 *   {action:"login", name, pin}                  -> {ok,user:{id,name,modules,adminModules}}
 *   {action:"changePin", name, newPin}           -> {ok}
 *   -- superadmin (wajib callerName + callerPin) --
 *   {action:"listUsers"}                         -> {ok,users:[{...,grants,denies}],modules:[...]}
 *   {action:"saveUser", id?,name,pin,active,keterangan}
 *   {action:"deleteUser", id}
 *   {action:"listModules", all?}                 -> {ok,modules:[{key,label,active}]}
 *   {action:"syncModules", modules:[{key,label}]}-> {ok,added:[...]}
 *   {action:"saveModule", key,label?,active?}
 *   {action:"setAdmin", userId,module,access}
 *   {action:"listAccess"}                        -> {ok,users:[...],modules:[...]}
 *   {action:"setModuleAccess", userId,module,access}
 *   {action:"import", users?,modules?,grants?,admins?}  <- pindahan dari Sheet
 *   -- admin modul --
 *   {action:"listModuleMembers", module}         -> {ok,members:[...]}
 *   -- tanpa gerbang, dipanggil modul saat boot --
 *   {action:"listModuleRoster", module}          -> {ok,members:[...]}
 *   {action:"listDivisiRoster"}                  -> {ok,members:[{id,name,keterangan,noHp,talentaId,active}]}  (tanpa PIN)
 *
 * Diagnostik (GET):  ?action=ping   ?action=stats
 ************************************************************************/

require __DIR__ . '/lib_account_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($obj) { echo json_encode($obj, JSON_UNESCAPED_UNICODE); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$body = array();
if ($method === 'POST') {
  $raw  = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = array();
}
$action = $method === 'POST'
  ? (isset($body['action']) ? $body['action'] : '')
  : (isset($_GET['action']) ? $_GET['action'] : 'ping');

// Token opsional (config.php). Kosong = terbuka, sama seperti Apps Script
// yang dideploy "Anyone". Tulisannya tetap dijaga oleh callerName+callerPin.
if (defined('API_TOKEN') && API_TOKEN !== '') {
  $tok = isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : '');
  if (!hash_equals(API_TOKEN, (string)$tok)) keluar(array('ok' => false, 'error' => 'token salah'));
}

try {
  // Database yang baru dipasang belum punya siapa-siapa; tanpa ini tidak
  // ada satu pun akun yang bisa masuk untuk membuat akun pertama.
  seed_bila_kosong();

  switch ($action) {
    case 'login':
      keluar(aksi_login(isset($body['name']) ? $body['name'] : '',
                        isset($body['pin'])  ? $body['pin']  : ''));
    // whoami: dipanggil MODUL LAIN (server ke server) untuk memastikan siapa
    // pemilik token sesi. Tanpa gerbang superadmin — tokennya sendiri buktinya.
    case 'whoami':            keluar(aksi_whoami($body));
    case 'logout':            keluar(aksi_logout($body));
    case 'changePin':         keluar(aksi_ganti_pin($body));
    case 'setUsername':       keluar(aksi_set_username($body));
    case 'listUsers':         keluar(aksi_list_users($body));
    case 'saveUser':          keluar(aksi_simpan_user($body));
    case 'deleteUser':        keluar(aksi_hapus_user($body));
    case 'listModules':       keluar(aksi_list_modules($body));
    case 'syncModules':       keluar(aksi_sync_modules($body));
    case 'saveModule':        keluar(aksi_simpan_module($body));
    case 'setAdmin':          keluar(aksi_set_admin($body));
    case 'listAccess':        keluar(aksi_list_access($body));
    case 'setModuleAccess':   keluar(aksi_set_module_access($body));
    case 'listModuleMembers': keluar(aksi_list_module_members($body));
    case 'listModuleRoster':  keluar(aksi_list_module_roster($body));
    case 'listDivisiRoster':  keluar(aksi_list_divisi_roster($body));
    case 'import':            keluar(aksi_import($body));
    case 'sessionRefresh':    keluar(aksi_segarkan_sesi($body));

    case 'ping':  keluar(array('ok' => true, 'data' => ping()));
    case 'stats': keluar(array('ok' => true, 'data' => stats()));

    // Nama error disamakan dengan Apps Script supaya penanganan di
    // frontend tidak perlu diubah.
    default: keluar(array('ok' => false, 'error' => 'unknown_action'));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
