#!/usr/bin/env node
/* Uji hak akses backend DW & Jadwal Shift — DIJALANKAN SUNGGUHAN.
   ---------------------------------------------------------------------------
   Hak akses adalah satu-satunya bagian repo ini yang kegagalannya TIDAK
   terlihat dari layar. Penjaga yang longgar tidak menampilkan apa pun yang
   aneh: modulnya bekerja persis seperti biasa bagi orang yang memang berhak,
   dan bagi yang tidak berhak ia juga bekerja — itu masalahnya. Smoke test
   tidak menangkapnya sama sekali karena tidak ada yang melempar.

   Karena itu uji ini menembak API-nya betulan lewat `php -S`, dengan:
     - SQLite sebagai ganti MySQL (config.local.php khusus uji), dan
     - account-api TIRUAN yang memulangkan tiga orang berbeda peran.

   Yang diuji adalah kalimat yang diminta pemiliknya:
       DW           -> yang memutuskan ajuan HANYA HRD
       Jadwal Shift -> jadwal sebuah divisi HANYA disusun head divisi itu
   plus dua hal yang tidak boleh ikut terbuka: token asing dan token kosong.

   Pemakaian:  node tools/uji-hak-akses.js
   Butuh `php` di PATH. Kalau tidak ada, ia MELEWAT (bukan gagal) — sama
   seperti tools/uji-qr.js, supaya mesin tanpa PHP tidak menghasilkan merah
   palsu.
   =========================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

if (spawnSync('php', ['-v'], { shell: true }).status !== 0) {
  console.log('LEWAT  uji-hak-akses — `php` tidak ada di PATH');
  process.exit(0);
}
/* PDO SQLite dipakai sebagai ganti MySQL. Kalau ekstensinya tidak ada, uji
   ini tidak bisa berjalan — dan itu bukan kegagalan hak aksesnya.

   Diperiksa lewat `php -m`, BUKAN `php -r 'extension_loaded(...)'`: di Windows
   spawn dengan shell:true melewati cmd.exe, yang tidak mengenal petik tunggal
   sebagai pengutip — perintahnya jadi kacau dan uji ini MELEWAT dengan alasan
   yang salah, padahal ekstensinya ada. Sudah kejadian saat berkas ini dibuat. */
const modul = spawnSync('php', ['-m'], { shell: true });
if (!/^\s*pdo_sqlite\s*$/mi.test(String(modul.stdout || ''))) {
  console.log('LEWAT  uji-hak-akses — ekstensi pdo_sqlite tidak aktif di PHP ini');
  process.exit(0);
}

/* --------------------------------------------------------------------------
   Panggung: satu direktori sementara berisi salinan kedua backend, akun
   tiruan, dan config.local.php yang mengarahkan db() ke SQLite.

   config.local.php memang sudah didahulukan oleh kedua lib (lihat baris
   pertamanya), jadi tidak ada satu baris pun kode produksi yang perlu diubah
   supaya bisa diuji.
   -------------------------------------------------------------------------- */
const PANGGUNG = fs.mkdtempSync(path.join(os.tmpdir(), 'uji-akses-'));
/* Port acak tiap jalan. Port tetap terdengar lebih rapi tapi justru menipu:
   satu server PHP yang tertinggal dari jalan sebelumnya akan terus memegang
   port itu sambil melayani direktori yang SUDAH DIHAPUS, jadi tiap permintaan
   dijawab 404 — termasuk permintaan ke account-api tiruan, sehingga SELURUH
   pemeriksaan gagal dengan `sesi_tidak_sah` dan terbaca seperti penjaganya
   yang rusak. Sudah kejadian saat berkas ini dibuat, dan butuh beberapa menit
   untuk disadari karena pesannya sangat meyakinkan. */
const PORT = 8800 + Math.floor(Math.random() * 900);
const BASE = 'http://127.0.0.1:' + PORT;
/* account-api tiruan dilayani server SENDIRI di port lain, dan itu WAJIB —
   bukan kerapian. Server bawaan PHP (`php -S`) melayani SATU permintaan pada
   satu waktu. Backend yang sedang melayani permintaan kita memanggil balik
   account-api server-ke-server; kalau keduanya di server yang sama, panggilan
   itu antre di belakang permintaan yang sedang menunggunya — buntu sempurna
   sampai curl menyerah setelah 8 detik. Gejalanya menipu: SEMUA pemeriksaan
   gagal dengan `sesi_tidak_sah`, persis seperti penjaganya yang rusak. */
const PORT_AKUN = PORT + 1;
const BASE_AKUN = 'http://127.0.0.1:' + PORT_AKUN;

function salinBackend(nama) {
  const dari = path.join(ROOT, nama);
  const ke = path.join(PANGGUNG, nama);
  fs.mkdirSync(ke, { recursive: true });
  fs.readdirSync(dari)
    .filter(f => f.endsWith('.php') && !/^config/.test(f))
    .forEach(f => fs.copyFileSync(path.join(dari, f), path.join(ke, f)));
  /* db() dibuat memakai SQLite. Tanda tangannya sama (PDO), dan seluruh SQL
     di kedua lib memang SQL biasa — kecuali dua hal yang ditambal di bawah. */
  fs.writeFileSync(path.join(ke, 'config.local.php'), `<?php
define('DB_HOST','x'); define('DB_PORT',0); define('DB_NAME','uji');
define('DB_USER',''); define('DB_PASS',''); define('DB_CHARSET','utf8mb4');
define('ENV_LABEL','uji'); define('API_TOKEN','');
define('ACCOUNT_API_URL', '${BASE_AKUN}/akun.php');
`);
  return ke;
}

const dirDW = salinBackend('dw-mysql');
const dirJD = salinBackend('jadwal-mysql');

/* --------------------------------------------------------------------------
   TERJEMAHAN DIALEK — HANYA DI SALINAN, TIDAK PERNAH DI SUMBER.

   Yang diuji tetap berkas produksi apa adanya; yang diganti cuma sambungan
   databasenya (MySQL -> SQLite) dan beberapa bentuk SQL yang memang khas
   MySQL. Batasnya penting untuk dipahami saat membaca hasil uji ini:

     DITERJEMAHKAN  bentuk DDL, ON DUPLICATE KEY UPDATE, FOR UPDATE
     TIDAK DIUJI    perilaku kunci unik yang persis sama dengan MySQL

   Logika hak akses sendiri — siapa boleh apa — tidak menyentuh satu pun dari
   itu, jadi yang dilaporkan uji ini tetap jawaban yang sebenarnya.
   -------------------------------------------------------------------------- */
/* Sasaran konflik untuk tiap tabel. SQLite mewajibkan ON CONFLICT menyebut
   kolomnya; MySQL menyimpulkannya sendiri dari kunci unik mana pun yang
   kena. Yang dipilih di sini kunci yang memang jadi maksud pernyataannya. */
const SASARAN_KONFLIK = {
  dw_ajuan: '`dw_id`,`tgl`', dw_setting: '`id`',
  jadwal_sel: '`user_id`,`tgl`', jadwal_setting: '`id`', jadwal_pengajuan: '`id`',
};

function tambalDb(dir, namaLib) {
  const f = path.join(dir, namaLib);
  let s = fs.readFileSync(f, 'utf8');

  s = s.replace(/function db\(\) \{[\s\S]*?\n\}/,
    `function db() {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $pdo = new PDO('sqlite:' . __DIR__ . '/uji.sqlite', null, null, array(
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ));
  $pdo->exec('PRAGMA busy_timeout = 4000');
  return $pdo;
}`);

  /* DDL: tipe & pernik MySQL dibuang, tapi UNIQUE KEY DIPERTAHANKAN sebagai
     UNIQUE — ia yang menjadi sasaran ON CONFLICT di bawah, dan tanpa itu
     "kirim ulang menimpa baris lama" berubah jadi baris kedua diam-diam. */
  s = s.replace(/'CREATE TABLE IF NOT EXISTS[\s\S]*?ENGINE=InnoDB[^']*'/g, (blok) => {
    let d = blok
      .replace(/\)\s*ENGINE=InnoDB[^']*/, ')')
      .replace(/TINYINT UNSIGNED/g, 'INTEGER')
      .replace(/LONGTEXT/g, 'TEXT')
      .replace(/BIGINT/g, 'INTEGER')
      .replace(/\bDATE\b/g, 'TEXT')
      .replace(/,\s*KEY\s+\\?`[^`]+\\?`\s*\(([^)]*)\)/g, '')
      .replace(/UNIQUE KEY\s+\\?`[^`]+\\?`\s*\(/g, 'UNIQUE (');
    return d;
  });

  /* INSERT ... ON DUPLICATE KEY UPDATE x=VALUES(x)
     ->  INSERT ... ON CONFLICT(<sasaran>) DO UPDATE SET x=excluded.x

     `(?:(?!INSERT INTO)[\s\S])*?` — bagian tengahnya TIDAK BOLEH melompati
     INSERT lain. Dengan `[\s\S]*?` biasa, INSERT tanpa ON DUPLICATE (mis.
     dw_pekerja) menelan seluruh pernyataan berikutnya sampai menemukan ON
     DUPLICATE milik dw_ajuan — nama tabel yang tertangkap jadi yang salah,
     penggantiannya batal, dan dw_ajuan tidak pernah diterjemahkan. */
  s = s.replace(/INSERT INTO `(\w+)`((?:(?!INSERT INTO)[\s\S])*?)ON DUPLICATE KEY UPDATE/g,
    (m, tabel, tengah) => {
      const target = SASARAN_KONFLIK[tabel];
      if (!target) return m;
      return 'INSERT INTO `' + tabel + '`' + tengah + 'ON CONFLICT(' + target + ') DO UPDATE SET';
    });

  /* pastikan_kolom() bertanya ke information_schema, yang tidak ada di SQLite;
     try/catch-nya menelan kegagalan itu diam-diam, jadi kolom yang lahir
     belakangan (shift, jam_mulai, jam_selesai di jadwal_pengajuan) TIDAK
     pernah terbentuk dan simpanPengajuan gagal dengan "no such column" —
     kegagalan harness yang terbaca persis seperti kegagalan modul. */
  s = s.replace(/function pastikan_kolom\([\s\S]*?\n\}/,
    `function pastikan_kolom($pdo, $tabel, $kolom, $ddl) {
  try {
    foreach ($pdo->query('PRAGMA table_info(\`' . $tabel . '\`)')->fetchAll() as $c) {
      if ($c['name'] === $kolom) return;
    }
    $pdo->exec('ALTER TABLE \`' . $tabel . '\` ADD COLUMN \`' . $kolom . '\` ' . $ddl);
  } catch (Throwable $e) { }
}`);
  s = s.replace(/VALUES\(`(\w+)`\)/g, 'excluded.`$1`');
  s = s.replace(/ FOR UPDATE/g, '');       // penguncian baris: tidak ada di SQLite

  fs.writeFileSync(f, s);
}
tambalDb(dirDW, 'lib_dw_mysql.php');
tambalDb(dirJD, 'lib_jadwal_mysql.php');

/* ---------------------------------------------------------------------------
   account-api TIRUAN. Tiga peran, dan itulah yang membedakan uji ini dari
   sekadar "ada penjaganya":
     tok-admin  -> admin modul dw & jadwal
     tok-hrd    -> staf Office, terdaftar sebagai HRD di dw_setting
     tok-staf   -> staf Office biasa: punya akses modul, TIDAK berhak memutus
     tok-headbar-> head divisi Bar saja (untuk modul Jadwal)
   --------------------------------------------------------------------------- */
fs.writeFileSync(path.join(PANGGUNG, 'akun.php'), `<?php
header('Content-Type: application/json');
$b = json_decode(file_get_contents('php://input'), true);
if (!is_array($b)) $b = array();
$act = isset($b['action']) ? $b['action'] : '';
$orang = array(
  'tok-admin'   => array('id'=>'u-admin','name'=>'Uji Admin','keterangan'=>'Manajemen',
                         'modules'=>array('*'),'adminModules'=>array('*')),
  'tok-hrd'     => array('id'=>'u-hrd','name'=>'Uji HRD','keterangan'=>'HRD',
                         'modules'=>array('dw','jadwal'),'adminModules'=>array()),
  'tok-staf'    => array('id'=>'u-staf','name'=>'Uji Staf','keterangan'=>'Marketing',
                         'modules'=>array('dw','jadwal'),'adminModules'=>array()),
  /* Head divisi Bar. Kunci headDivisi adalah yang dipulangkan account-api
     asli sesudah menanyakannya ke modul Jadwal (action=headIds); modul DW
     memakainya apa adanya, tanpa bertanya sekali lagi.
     CATATAN: blok PHP ini duduk di dalam template literal JS — JANGAN pakai
     backtick di sini, satu saja memutus literalnya dan seluruh berkas gagal
     diurai dengan pesan yang tidak menyebut barisnya. */
  'tok-headbar' => array('id'=>'u-headbar','name'=>'Uji Head Bar','keterangan'=>'Bar',
                         'modules'=>array('jadwal','dw'),'adminModules'=>array(),
                         'headDivisi'=>array('bar')),
  /* Pegawai tetap yang centangnya TERTUKAR di Kelola Akses: ia memegang
     "Roster · Daily Worker" padahal yang ia butuhkan "Roster · Jadwal Shift".
     Inilah keadaan yang membuat pegawai tetap mendarat di modul DW — pemilih
     panel mengalihkannya ke satu-satunya panel yang ia pegang. */
  'tok-salahcentang' => array('id'=>'u-andi','name'=>'Uji Andi','keterangan'=>'Cashier',
                         'modules'=>array('dw'),'adminModules'=>array()),
);
if ($act === 'whoami') {
  $t = isset($b['token']) ? $b['token'] : '';
  if (isset($orang[$t])) { echo json_encode(array('ok'=>true,'user'=>$orang[$t])); exit; }
  echo json_encode(array('ok'=>false,'error'=>'invalid_token')); exit;
}
if ($act === 'listDivisiRoster') {
  echo json_encode(array('ok'=>true,'members'=>array(
    array('id'=>'kru-bar','name'=>'Kru Bar','keterangan'=>'Bar','active'=>true),
    array('id'=>'kru-kitchen','name'=>'Kru Kitchen','keterangan'=>'Kitchen','active'=>true),
    array('id'=>'u-headbar','name'=>'Uji Head Bar','keterangan'=>'Bar','active'=>true),
  ))); exit;
}
echo json_encode(array('ok'=>false,'error'=>'aksi tidak dikenal'));
`);

/* --------------------------------------------------------------------------- */
const srv = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', PANGGUNG], { shell: true });
const srvAkun = spawn('php', ['-S', '127.0.0.1:' + PORT_AKUN, '-t', PANGGUNG], { shell: true });
let srvErr = '';
srv.stderr.on('data', d => { srvErr += String(d); });
srvAkun.stderr.on('data', d => { srvErr += String(d); });
let gagal = 0, jumlah = 0;

/* srv.kill() TIDAK CUKUP di Windows: shell:true menjalankan cmd.exe, dan yang
   mati cuma cmd.exe — php.exe di bawahnya terus hidup, terus memegang portnya,
   dan terus melayani direktori yang sebentar lagi dihapus. Seluruh pohon
   prosesnya harus dihabisi (taskkill /T). */
function bersih() {
  [srv, srvAkun].forEach(p => {
    try {
      if (process.platform === 'win32' && p.pid) {
        spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      }
      p.kill();
    } catch (_) {}
  });
  try { fs.rmSync(PANGGUNG, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', bersih);
process.on('SIGINT', () => process.exit(1));

function panggil(modul, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = http.request(BASE + '/' + modul + '/api.php',
      { method: 'POST', headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let b = ''; res.on('data', c => b += c);
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ ok: false, error: 'bukan JSON: ' + b.slice(0, 200) }); } });
      });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(data); req.end();
  });
}
function ambil(modul, qs) {
  return new Promise((resolve) => {
    http.get(BASE + '/' + modul + '/api.php?' + qs, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ ok: false, error: 'bukan JSON: ' + b.slice(0, 200) }); } });
    }).on('error', e => resolve({ ok: false, error: e.message }));
  });
}

function cek(nama, lulus, ket) {
  jumlah++;
  if (lulus) { console.log('OK     ' + nama); return; }
  gagal++;
  console.log('GAGAL  ' + nama + (ket ? ' — ' + ket : ''));
}
const ditolak = (j) => !j.ok && /tidak_berhak|sesi_tidak_sah/.test(String(j.error || ''));

/* Menunggu sampai PHP benar-benar MELAYANI, bukan sampai ia menjawab apa pun:
   `ambil()` memulangkan {ok:false,error:'ECONNREFUSED'} saat server belum ada,
   dan versi pertama fungsi ini menganggap itu sudah siap. Akibatnya seluruh 36
   pemeriksaan berjalan melawan server yang belum hidup dan semuanya merah —
   merah yang tidak ada hubungannya dengan hak akses. */
async function tunggu() {
  for (let i = 0; i < 60; i++) {
    const j = await ambil('dw-mysql', 'action=ping');
    if (j && j.ok) return;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server php tidak pernah melayani ?action=ping'
    + (srvErr ? '\n       stderr php: ' + srvErr.trim().split('\n').slice(-4).join('\n       ') : ''));
}

async function main() {
  await tunggu();

  /* ================= MODUL DW ================= */
  console.log('\n— Daily Worker —');

  // Admin menyiapkan panggung: daftar HRD diisi, satu DW didaftarkan.
  let j = await panggil('dw-mysql', { action: 'simpanSetting', sesi: 'tok-admin',
    data: { hr: ['u-hrd'], tarif: {}, kuota: {} } });
  cek('admin bisa menulis pengaturan', j.ok, j.error);

  j = await panggil('dw-mysql', { action: 'simpanSetting', sesi: 'tok-hrd', data: { hr: [] } });
  cek('HRD TIDAK bisa menulis pengaturan (bisa mengangkat dirinya jadi admin)', ditolak(j), JSON.stringify(j));

  j = await panggil('dw-mysql', { action: 'simpanPekerja', sesi: 'tok-hrd',
    row: { nama: 'Arif DW', hp: '081200000001', pin: '1234', divisi: 'bar', posisi: 'Bar Helper' } });
  cek('HRD bisa mendaftarkan daily worker', j.ok, j.error);
  const dwId = j.ok ? j.data.id : '';

  j = await panggil('dw-mysql', { action: 'simpanPekerja', sesi: 'tok-staf',
    row: { nama: 'Selundupan', hp: '081200000009' } });
  cek('staf biasa TIDAK bisa mendaftarkan daily worker', ditolak(j), JSON.stringify(j));

  j = await panggil('dw-mysql', { action: 'simpanAjuan', sesi: 'tok-hrd',
    row: { dwId, tgl: '2026-08-20', m: '16:00', s: '23:00', divisi: 'bar', posisi: 'Bar Helper' } });
  cek('HRD bisa membuat ajuan atas nama DW', j.ok && j.data.saved, j.error);
  const ajuId = (j.ok && j.data.row) ? j.data.row.id : '';

  // ——— inti permintaan: yang memutuskan hanya HRD ———
  j = await panggil('dw-mysql', { action: 'putusAjuan', sesi: 'tok-staf', id: ajuId, status: 'DISETUJUI' });
  cek('staf biasa TIDAK bisa MENYETUJUI ajuan', ditolak(j), JSON.stringify(j));

  j = await panggil('dw-mysql', { action: 'putusBanyak', sesi: 'tok-staf', ids: [ajuId], status: 'DISETUJUI' });
  cek('staf biasa TIDAK bisa menyetujui borongan', ditolak(j), JSON.stringify(j));

  j = await panggil('dw-mysql', { action: 'putusAjuan', sesi: 'tok-hrd', id: ajuId, status: 'DISETUJUI' });
  cek('HRD bisa menyetujui ajuan', j.ok, j.error);

  // ——— nomor HP tidak ikut ke staf yang bukan HRD ———
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-hrd');
  const hrdLihatHp = j.ok && j.data.pekerja[0] && typeof j.data.pekerja[0].hp === 'string';
  cek('HRD menerima no. HP talent pool', hrdLihatHp, JSON.stringify(j).slice(0, 200));

  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-staf');
  const stafLihatHp = j.ok && j.data.pekerja[0] && j.data.pekerja[0].hp !== undefined;
  cek('staf biasa TIDAK menerima no. HP siapa pun', j.ok && !stafLihatHp, JSON.stringify(j).slice(0, 200));

  // ——— pintu yang harus tertutup rapat ———
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31');
  cek('tanpa token, getAll ditolak', ditolak(j), JSON.stringify(j).slice(0, 160));

  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=token-karangan');
  cek('token karangan ditolak', ditolak(j), JSON.stringify(j).slice(0, 160));

  /* ——— jalur masuk daily worker sudah TIDAK ADA ———
     Dicabut 14 Agustus 2026: DW tidak punya akun dan tidak pernah membuka
     sistem. Diuji supaya gerbangnya tidak pernah hidup lagi tanpa sengaja —
     endpoint yang dihidupkan kembali diam-diam tidak akan terlihat dari layar
     mana pun, dan ia menerima tebakan PIN dari siapa saja. */
  for (const mati of ['loginDW', 'logoutDW', 'ajuanSaya']) {
    j = await panggil('dw-mysql', { action: mati, hp: '081200000001', pin: '1234' });
    cek('aksi `' + mati + '` sudah tidak dikenal', !j.ok && /tidak dikenal/i.test(String(j.error || '')),
      JSON.stringify(j).slice(0, 140));
  }

  /* Nomor HP boleh dibaca HRD, tapi PIN TIDAK PERNAH ikut — kolomnya masih
     ada di database (sengaja tidak di-DROP) dan yang menjaganya sekarang cuma
     daftar kolom di baca_semua(). */
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-hrd');
  cek('PIN tidak pernah ikut terkirim ke layar',
    j.ok && JSON.stringify(j).indexOf('"pin"') < 0 && JSON.stringify(j).indexOf('adaPin') < 0,
    JSON.stringify(j).slice(0, 160));

  /* ——— HEAD DIVISI di modul DW: lihat semuanya, putuskan tidak satu pun ——— */
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-headbar');
  cek('head bisa membuka modul DW', j.ok, j.error);
  cek('head menerima isi PENUH (termasuk no. HP talent pool)',
    j.ok && j.data.pekerja[0] && typeof j.data.pekerja[0].hp === 'string',
    JSON.stringify(j).slice(0, 160));
  cek('peran head dilaporkan server apa adanya',
    j.ok && j.data.peran && j.data.peran.head === 1 && j.data.peran.lihat === 1 && j.data.peran.hrd === 0,
    JSON.stringify(j.ok ? j.data.peran : j).slice(0, 160));

  j = await panggil('dw-mysql', { action: 'putusAjuan', sesi: 'tok-headbar', id: ajuId, status: 'DISETUJUI' });
  cek('head TIDAK bisa menyetujui ajuan DW', ditolak(j), JSON.stringify(j));
  j = await panggil('dw-mysql', { action: 'simpanPekerja', sesi: 'tok-headbar',
    row: { nama: 'Selundupan Head', hp: '081200000077' } });
  cek('head TIDAK bisa menyunting talent pool', ditolak(j), JSON.stringify(j));
  j = await panggil('dw-mysql', { action: 'tandaiBayar', sesi: 'tok-headbar',
    senin: '2026-08-10', kunci: 'BANK|1', nyala: true });
  cek('head TIDAK bisa menandai pembayaran', ditolak(j), JSON.stringify(j));

  /* Staf biasa tetap TIDAK menerima isi penuh — pembeda head vs staf harus
     benar-benar berbeda, bukan cuma label yang berbeda. */
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-staf');
  cek('staf biasa tetap tanpa no. HP dan peran lihat=0',
    j.ok && j.data.pekerja[0] && j.data.pekerja[0].hp === undefined && j.data.peran.lihat === 0,
    JSON.stringify(j.ok ? j.data.peran : j).slice(0, 160));

  /* ================= MODUL JADWAL SHIFT ================= */  /* ================= MODUL JADWAL SHIFT ================= */
  console.log('\n— Jadwal Shift —');

  j = await panggil('jadwal-mysql', { action: 'simpanSetting', sesi: 'tok-admin',
    data: { heads: { bar: ['u-headbar'] }, shifts: {}, divOverride: {} } });
  cek('admin bisa menunjuk head divisi', j.ok, j.error);

  j = await panggil('jadwal-mysql', { action: 'simpanSetting', sesi: 'tok-headbar',
    data: { heads: { bar: ['u-headbar'], kitchen: ['u-headbar'] } } });
  cek('head TIDAK bisa menulis pengaturan (bisa mengangkat dirinya jadi head semua divisi)',
    ditolak(j), JSON.stringify(j));

  const selBar = [{ u: 'kru-bar', d: '2026-08-20', t: 'PAGI' }];
  const selKitchen = [{ u: 'kru-kitchen', d: '2026-08-20', t: 'PAGI' }];

  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-headbar', rows: selBar, hapus: [] });
  cek('head Bar bisa menyusun jadwal kru Bar', j.ok && j.data.isi === 1, j.error);

  // ——— inti permintaan: divisi lain tidak boleh disentuh ———
  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-headbar', rows: selKitchen, hapus: [] });
  cek('head Bar TIDAK bisa menyusun jadwal kru Kitchen', ditolak(j), JSON.stringify(j));

  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-headbar', rows: [], hapus: selKitchen });
  cek('head Bar TIDAK bisa MENGHAPUS sel kru Kitchen', ditolak(j), JSON.stringify(j));

  /* Satu kiriman campuran: baris yang sah TIDAK boleh ikut masuk kalau ada
     baris yang tidak sah di dalamnya — separuh tersimpan lebih berbahaya
     daripada gagal semua, karena layarnya melaporkan berhasil. */
  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-headbar',
    rows: [{ u: 'kru-bar', d: '2026-08-21', t: 'SIANG' }, { u: 'kru-kitchen', d: '2026-08-21', t: 'SIANG' }], hapus: [] });
  const campurDitolak = ditolak(j);
  const cek2 = await ambil('jadwal-mysql', 'action=getAll&dari=2026-08-21&sampai=2026-08-21&sesi=tok-admin');
  const adaYangBocor = cek2.ok && cek2.data.sel.some(x => x.d === '2026-08-21');
  cek('kiriman campur ditolak UTUH, tidak separuh masuk', campurDitolak && !adaYangBocor,
    campurDitolak ? 'ditolak tapi ada baris yang terlanjur tersimpan' : JSON.stringify(j));

  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-staf', rows: selBar, hapus: [] });
  cek('staf biasa TIDAK bisa menyusun jadwal divisi mana pun', ditolak(j), JSON.stringify(j));

  j = await panggil('jadwal-mysql', { action: 'simpanSel', sesi: 'tok-admin', rows: selKitchen, hapus: [] });
  cek('admin modul bisa menyusun jadwal semua divisi', j.ok, j.error);

  j = await ambil('jadwal-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31');
  cek('tanpa token, jadwal + alasan izin/cuti tidak bisa dibaca', ditolak(j), JSON.stringify(j).slice(0, 160));

  /* ——— akun sah tapi centangnya kurang: HARUS beda pesannya ———
     Kalau ini dijawab `sesi_tidak_sah`, orangnya disuruh masuk ulang, ia masuk
     ulang, ditolak lagi — berputar tanpa pernah tahu kotak mana yang kurang.
     Pesannya wajib menyebut nama centang PERSIS seperti di Kelola Akses,
     karena di sana tidak ada kotak bernama "Jadwal Shift": yang ada
     "Roster · Jadwal Shift", bersebelahan dengan "Roster · Daily Worker". */
  j = await ambil('jadwal-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-salahcentang');
  const pesanKurang = String(j.error || '');
  cek('akun tanpa kunci `jadwal` ditolak SEBAGAI kurang akses, bukan sesi berakhir',
    !j.ok && pesanKurang.indexOf('tanpa_modul') === 0, pesanKurang.slice(0, 120));
  cek('pesannya menyebut nama centang yang persis ada di Kelola Akses',
    pesanKurang.indexOf('Roster · Jadwal Shift') > -1, pesanKurang.slice(0, 160));

  /* Dan orang yang sama TETAP diterima modul DW — memang itu kunci yang ia
     pegang. Ini yang membuat gejalanya membingungkan: tidak ada yang rusak,
     ia cuma diberi kunci yang salah. */
  j = await ambil('dw-mysql', 'action=getAll&dari=2026-08-01&sampai=2026-08-31&sesi=tok-salahcentang');
  cek('akun yang sama tetap diterima modul DW (kunci yang memang ia pegang)', j.ok, j.error);

  /* ——— pengajuan: kru untuk dirinya, head yang memutus ——— */
  j = await panggil('jadwal-mysql', { action: 'simpanPengajuan', sesi: 'tok-staf',
    row: { userId: 'kru-kitchen', jenis: 'CUTI', dari: '2026-09-01', sampai: '2026-09-02', alasan: 'uji' } });
  const idAju = j.ok ? j.data.id : '';
  cek('kru bisa mengirim pengajuan', j.ok, j.error);

  j = await ambil('jadwal-mysql', 'action=getAll&sesi=tok-admin');
  const aju = j.ok ? (j.data.pengajuan || []).find(a => a.id === idAju) : null;
  cek('pengajuan dipaksa atas nama pengirimnya sendiri, bukan userId yang dikirim',
    !!aju && aju.userId === 'u-staf', aju ? 'mendarat di ' + aju.userId : 'tidak ketemu');

  j = await panggil('jadwal-mysql', { action: 'putusPengajuan', sesi: 'tok-staf', id: idAju, status: 'DISETUJUI' });
  cek('pengaju TIDAK bisa menyetujui pengajuannya sendiri', ditolak(j), JSON.stringify(j));

  j = await panggil('jadwal-mysql', { action: 'putusPengajuan', sesi: 'tok-headbar', id: idAju, status: 'DISETUJUI' });
  cek('head divisi LAIN TIDAK bisa memutuskan pengajuan itu', ditolak(j), JSON.stringify(j));

  j = await panggil('jadwal-mysql', { action: 'putusPengajuan', sesi: 'tok-admin', id: idAju, status: 'DISETUJUI' });
  cek('admin bisa memutuskan pengajuan', j.ok, j.error);

  /* ——— yang SENGAJA tetap terbuka (dipakai lintas modul) ——— */
  j = await ambil('dw-mysql', 'action=jadwalDW&dari=2026-08-01&sampai=2026-08-31');
  cek('jadwalDW tetap terbuka (dibaca modul Jadwal & backend Absensi)', j.ok, j.error);
  const bocorHp = JSON.stringify(j).indexOf('081200000001') > -1;
  cek('jadwalDW tidak pernah memuat no. HP', !bocorHp, 'ada nomor HP di balasannya');

  j = await ambil('jadwal-mysql', 'action=shiftHari&user=kru-bar&dari=2026-08-20&sampai=2026-08-20');
  cek('shiftHari tetap terbuka (dipanggil backend Absensi)', j.ok, j.error);

  /* headIds — jalur yang dipakai Office untuk memberi head kunci modul DW.
     Isinya harus id + divisi saja: tidak ada nama, tidak ada jadwal. */
  j = await ambil('jadwal-mysql', 'action=headIds');
  const heads = j.ok ? (j.data.heads || {}) : {};
  cek('headIds memulangkan head Bar', !!(heads['u-headbar'] || []).includes('bar'),
    JSON.stringify(j).slice(0, 160));
  cek('headIds tidak membocorkan nama siapa pun',
    JSON.stringify(j).indexOf('Uji Head Bar') < 0 && JSON.stringify(j).indexOf('Kru Bar') < 0,
    JSON.stringify(j).slice(0, 160));

  console.log('\n' + (jumlah - gagal) + '/' + jumlah + ' pemeriksaan lulus');
  process.exit(gagal ? 1 : 0);
}

main().catch(e => { console.log('GAGAL  uji-hak-akses — ' + e.message); process.exit(1); });
