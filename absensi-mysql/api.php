<?php
/************************************************************************
 * ABSENSI LAKSAMANA — Endpoint API
 * ---------------------------------------------------------------------
 *   GET  ?action=konteks&sesi=<token>
 *        -> {ok,data:{siapa,shift,lokasi,setting,hariIni,hr}}
 *           Satu panggilan yang menyiapkan SELURUH layar absen. Dipisah
 *           jadi empat panggilan akan membuat layar tampil bertahap dan
 *           tombol Absen sempat aktif sebelum shift-nya diketahui.
 *   GET  ?action=rekap&dari=&sampai=&user=&tipe=&sesi=
 *   GET  ?action=antrean&sesi=
 *   GET  ?action=wajahDaftar&sesi=
 *   GET  ?action=ping | stats
 *
 *   POST {action:'absen', arah:'MASUK'|'PULANG', lat,lng,akurasi,
 *         descriptor:[128], foto:'data:...', alasan:'', sesi, dw:{id,nama}}
 *   POST {action:'daftarWajah', tipe,id,nama,descriptor,foto, sesi}
 *   POST {action:'hapusWajah',  tipe,id, sesi}
 *   POST {action:'putusAbsen',  id, status:'VALID'|'DITOLAK', nota, sesi}
 *   POST {action:'simpanLokasi',row:{...}, sesi}
 *   POST {action:'hapusLokasi', id, sesi}
 *   POST {action:'simpanSetting',data:{...}, sesi}
 *
 * IDENTITAS TIDAK PERNAH DIKIRIM SEBAGAI NAMA. Semua endpoint yang menulis
 * menuntut `sesi` (token Office) dan menanyakannya balik ke account-api.
 * Kalau yang dikirim cuma nama atau user_id, siapa pun yang membuka
 * Developer Tools bisa mengabsenkan orang lain — dan absensi yang bisa
 * dipalsukan dari kursi mana pun tidak menyimpan apa-apa yang berarti.
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 ************************************************************************/
require __DIR__ . '/lib_absensi_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($o) { echo json_encode($o, JSON_UNESCAPED_UNICODE); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$body = array();
if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = array();
}
$action = $method === 'POST'
  ? (isset($body['action']) ? $body['action'] : '')
  : (isset($_GET['action']) ? $_GET['action'] : 'konteks');

function ambil($body, $k, $def = '') { return isset($body[$k]) ? $body[$k] : $def; }
function token_sesi($body) {
  if (isset($_GET['sesi']) && $_GET['sesi'] !== '') return (string)$_GET['sesi'];
  if (isset($body['sesi'])) return (string)$body['sesi'];
  return '';
}
/* Pemanggil yang identitasnya tidak terbukti ditolak SEBELUM apa pun
   dikerjakan. Dibuat satu fungsi supaya tidak ada endpoint yang lupa —
   satu endpoint tulis yang lolos tanpa pemeriksaan sudah cukup untuk
   membatalkan gunanya seluruh berkas ini. */
function wajib_masuk($body) {
  $u = whoami(token_sesi($body));
  if (!$u) keluar(array('ok' => false, 'error' => 'Sesi tidak dikenali. Masuk lagi ya.'));
  /* Akses modul diperiksa di SETIAP endpoint tulis, bukan cuma saat login.
     Akses bisa dicabut di Office kapan saja, dan token yang sudah terlanjur
     dipegang akan tetap berlaku 30 hari — tanpa baris ini, pencabutan akses
     tidak berpengaruh apa pun sampai tokennya kedaluwarsa sendiri. */
  if (!pemanggil_boleh($u))
    keluar(array('ok' => false, 'error' => 'Akun ini tidak punya akses modul Absensi.'));
  return $u;
}
function wajib_hr($body) {
  $u = wajib_masuk($body);
  if (!pemanggil_hr($u)) keluar(array('ok' => false, 'error' => 'Hanya HR/admin modul yang boleh melakukan ini.'));
  return $u;
}

try {
  switch ($action) {

    /* ---------- masuk: diteruskan ke account-api ----------
       Situs ini berdiri di subdomain sendiri, jadi ia tidak bisa membaca
       sesi Office (localStorage terikat origin). Login sendiri, akun sama. */
    case 'masuk': {
      $u = teruskan_masuk(ambil($body, 'nama', ''), ambil($body, 'pin', ''));
      keluar(array('ok' => true, 'data' => array('user' => $u)));
    }

    /* ---------- konteks: semua yang dibutuhkan layar absen ---------- */
    case 'konteks': {
      $u = whoami(token_sesi($body));
      $set = baca_setting();
      $data = array('lokasi' => daftar_lokasi(true), 'setting' => $set,
                    'waktuServer' => (int)round(microtime(true) * 1000));
      if ($u) {
        $tgl = tgl_wib(null);
        $data['siapa'] = array('id' => s($u['id']), 'nama' => s($u['name']),
          'keterangan' => s(isset($u['keterangan']) ? $u['keterangan'] : ''),
          'boleh' => pemanggil_boleh($u) ? 1 : 0,
          'admin' => pemanggil_admin($u) ? 1 : 0, 'hr' => pemanggil_hr($u) ? 1 : 0);
        $data['shift'] = shift_hari('USER', $u['id'], $tgl);
        $data['tgl'] = $tgl;
        $r = rekap($tgl, $tgl, s($u['id']), 'USER');
        $data['hariIni'] = count($r['hari']) ? $r['hari'][0] : null;
        $pdo = db();
        $st = $pdo->prepare('SELECT COUNT(*) FROM `abs_wajah` WHERE `subjek`=:s AND `aktif`=1 AND `descriptor` IS NOT NULL');
        $st->execute(array(':s' => kunci_subjek('USER', $u['id'])));
        $data['wajahTerdaftar'] = ((int)$st->fetchColumn() > 0) ? 1 : 0;
      }
      keluar(array('ok' => true, 'data' => $data));
    }

    /* ---------- absen ---------- */
    case 'absen': {
      $u = wajib_masuk($body);
      /* SUBJEK SELALU DIAMBIL DARI TOKEN, tidak pernah dari badan
         permintaan. Ini satu-satunya baris yang menahan seseorang
         mengabsenkan rekannya, dan karena itu ia tidak boleh punya
         pengecualian "kecuali kalau admin" — admin yang perlu memperbaiki
         absensi orang lain memakai putusAbsen, yang meninggalkan jejak. */
      $p = array(
        'tipe' => 'USER', 'id' => s($u['id']), 'nama' => s($u['name']),
        'arah' => ambil($body, 'arah', ''),
        'lat' => ambil($body, 'lat', 0), 'lng' => ambil($body, 'lng', 0),
        'akurasi' => ambil($body, 'akurasi', 0),
        'descriptor' => ambil($body, 'descriptor', null),
        'foto' => ambil($body, 'foto', ''),
        'alasan' => ambil($body, 'alasan', ''),
      );
      keluar(array('ok' => true, 'data' => catat_punch($p, $u)));
    }

    /* ---------- wajah ---------- */
    case 'daftarWajah': {
      $u = wajib_masuk($body);
      $tipe = strtoupper(s(ambil($body, 'tipe', 'USER')));
      $id   = s(ambil($body, 'id', ''));
      /* Kru boleh mendaftarkan wajahnya SENDIRI (kalau tidak, HR harus
         memegang HP tiap orang satu per satu, dan modulnya tidak akan
         pernah selesai dipasang). Mendaftarkan wajah ORANG LAIN hanya HR —
         itu yang menahan seseorang menimpa wajah rekannya dengan wajahnya
         sendiri lalu mengabsen atas nama rekannya. */
      $miliknyaSendiri = ($tipe === 'USER' && $id === s($u['id']));
      if (!$miliknyaSendiri && !pemanggil_hr($u))
        keluar(array('ok' => false, 'error' => 'Hanya HR yang boleh mendaftarkan wajah orang lain.'));
      simpan_wajah($tipe, $id, ambil($body, 'nama', ''), ambil($body, 'descriptor', null),
                   ambil($body, 'foto', ''), s($u['name']));
      keluar(array('ok' => true, 'data' => array('tersimpan' => true)));
    }
    case 'hapusWajah': {
      $u = wajib_hr($body);
      keluar(array('ok' => true, 'data' => array('hapus' => hapus_wajah(ambil($body, 'tipe', 'USER'), ambil($body, 'id', '')))));
    }
    case 'wajahDaftar': {
      wajib_hr($body);
      keluar(array('ok' => true, 'data' => daftar_wajah()));
    }

    /* ---------- antrean & keputusan ---------- */
    case 'antrean': {
      wajib_hr($body);
      keluar(array('ok' => true, 'data' => antrean()));
    }
    case 'putusAbsen': {
      $u = wajib_hr($body);
      $ok = putus_punch(ambil($body, 'id', ''), ambil($body, 'status', ''), ambil($body, 'nota', ''), s($u['name']));
      keluar(array('ok' => true, 'data' => array('berubah' => $ok ? 1 : 0)));
    }

    /* ---------- rekap ---------- */
    case 'rekap': {
      $u = wajib_masuk($body);
      $uid  = s(isset($_GET['user']) ? $_GET['user'] : ambil($body, 'user', ''));
      $tipe = s(isset($_GET['tipe']) ? $_GET['tipe'] : ambil($body, 'tipe', ''));
      /* Kru biasa hanya boleh melihat rekapnya sendiri. Tanpa baris ini,
         seluruh jam datang & pulang satu perusahaan bisa dibaca siapa pun
         yang mengganti satu parameter di URL. */
      if (!pemanggil_hr($u)) { $uid = s($u['id']); $tipe = 'USER'; }
      keluar(array('ok' => true, 'data' => rekap(
        isset($_GET['dari']) ? $_GET['dari'] : ambil($body, 'dari', ''),
        isset($_GET['sampai']) ? $_GET['sampai'] : ambil($body, 'sampai', ''),
        $uid, $tipe)));
    }

    /* ---------- pengaturan ---------- */
    case 'simpanLokasi': {
      $u = wajib_hr($body);
      keluar(array('ok' => true, 'data' => array('id' => simpan_lokasi(ambil($body, 'row', array()), s($u['name'])))));
    }
    case 'hapusLokasi': {
      wajib_hr($body);
      keluar(array('ok' => true, 'data' => array('hapus' => hapus_lokasi(ambil($body, 'id', '')))));
    }
    case 'simpanSetting': {
      $u = wajib_hr($body);
      keluar(array('ok' => true, 'data' => simpan_setting(ambil($body, 'data', array()), s($u['name']))));
    }

    case 'ping':  keluar(array('ok' => true, 'data' => ping()));
    case 'stats': keluar(array('ok' => true, 'data' => stats()));

    default:
      keluar(array('ok' => false, 'error' => 'action tidak dikenal: ' . $action));
  }
} catch (Exception $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
