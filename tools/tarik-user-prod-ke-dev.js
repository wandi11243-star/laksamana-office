#!/usr/bin/env node
/* Menyalin data USER dari produksi ke dev — lewat API, bukan lewat database.
   ---------------------------------------------------------------------------
   Kenapa lewat API dan bukan dump SQL: MySQL Rumahweb tidak bisa dihubungi
   dari luar, dan mengekspor-impor lewat phpMyAdmin berarti seseorang harus
   mengingat tabel mana saja yang ikut (`users`, `modules`, `grants`,
   `admins` — yang terakhir paling sering terlupa, dan akibatnya dev punya
   semua orang tapi tidak satu pun admin modul).

   YANG DISALIN
     users    : id, nama, PIN, aktif, keterangan, talentaId  (id DIPERTAHANKAN)
     modules  : daftar modul beserta labelnya
     grants   : hak akses per modul, termasuk pengecualian (deny)
     admins   : siapa admin modul apa
     lalu susulan: username & no HP (dua kolom yang tidak dibawa `import`)

   ID SENGAJA DIPERTAHANKAN. Modul lain menyimpan user id apa adanya (head
   divisi di Jadwal Shift, PIC di Marketing, dst). Kalau dev memberi id baru,
   seluruh rujukan itu menunjuk orang yang salah — dan tidak ada satu pun
   pesan galat yang muncul.

   ARAHNYA SATU: produksi -> dev. Tidak pernah sebaliknya. Skrip menolak
   menulis kalau tujuannya ternyata bukan server dev (diperiksa lewat
   action=ping yang membalas env-nya).

   YANG TIDAK DILAKUKAN: menghapus. User yang hanya ada di dev dibiarkan
   hidup dan cuma dilaporkan — menghapusnya bisa membuang akun uji yang
   sengaja dibuat, dan itu tidak bisa dibatalkan.

   PAKAI
     # 1. lihat dulu apa yang akan terjadi (TIDAK menulis apa pun)
     PROD_ADMIN="Nama Superadmin" PROD_PIN=1234 \
     DEV_ADMIN="Nama Superadmin"  DEV_PIN=1234 \
     node tools/tarik-user-prod-ke-dev.js

     # 2. kalau ringkasannya sudah benar, baru terapkan
     ... node tools/tarik-user-prod-ke-dev.js --terapkan

   Di PowerShell:
     $env:PROD_ADMIN="Nama"; $env:PROD_PIN="1234"
     $env:DEV_ADMIN="Nama";  $env:DEV_PIN="1234"
     node tools/tarik-user-prod-ke-dev.js --terapkan

   PIN ikut tersalin apa adanya — itu memang tujuannya (supaya orang bisa
   masuk ke dev dengan PIN yang sama), tapi artinya server dev menyimpan
   kredensial sungguhan. Jangan dijalankan ke tujuan yang bukan milik sendiri.
   =========================================================================== */

const PROD = process.env.PROD_URL || 'https://team.laksamanamuda.id/account-api-mysql/api.php';
const DEV  = process.env.DEV_URL  || 'https://dev.laksamanamuda.id/account-api-mysql/api.php';
const TERAPKAN = process.argv.includes('--terapkan');

const cred = {
  prod: { callerName: process.env.PROD_ADMIN || '', callerPin: process.env.PROD_PIN || '' },
  dev:  { callerName: process.env.DEV_ADMIN  || '', callerPin: process.env.DEV_PIN  || '' }
};

/* Berhenti dengan MELEMPAR, bukan process.exit(). Di Windows, memanggil
   process.exit() saat masih ada koneksi fetch yang menggantung memunculkan
   "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" dari libuv — bunyi
   rusak yang tidak ada hubungannya dengan kesalahan yang sedang dilaporkan,
   dan orang yang membacanya akan mengira alatnya yang bermasalah. */
function mati(pesan){ const e = new Error(pesan); e._sudahDilaporkan = false; throw e; }

async function api(url, payload){
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // hindari preflight, sama dengan modul
    body: JSON.stringify(payload)
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch(e) {
    throw new Error('balasan bukan JSON dari ' + url + ' — ' + t.slice(0, 200));
  }
  if (!j || j.ok !== true) throw new Error((j && j.error) || 'ditolak server');
  return j;
}
async function ping(url){
  const r = await fetch(url + '?action=ping&t=' + Date.now());
  const j = await r.json();
  if (!j || !j.ok) throw new Error('ping gagal');
  return j.data || {};
}

(async () => {
  if (!cred.prod.callerName || !cred.prod.callerPin) mati('PROD_ADMIN / PROD_PIN belum diisi.');
  if (!cred.dev.callerName  || !cred.dev.callerPin)  mati('DEV_ADMIN / DEV_PIN belum diisi.');

  console.log('Sumber : ' + PROD);
  console.log('Tujuan : ' + DEV);
  console.log('Mode   : ' + (TERAPKAN ? 'TERAPKAN (menulis ke dev)' : 'lihat saja (tidak menulis apa pun)'));

  /* Penjaga arah. Satu-satunya cara skrip ini merusak sesuatu yang tidak bisa
     dikembalikan adalah kalau tujuannya ternyata produksi — jadi tujuannya
     wajib mengaku sebagai dev lebih dulu. */
  const pd = await ping(DEV).catch(e => mati('Server dev tidak menjawab: ' + e.message));
  console.log('       tujuan menjawab env="' + pd.env + '" db="' + pd.db + '"');
  if (String(pd.env).toLowerCase() !== 'dev') {
    mati('TUJUAN BUKAN SERVER DEV (env="' + pd.env + '"). Dihentikan sebelum menulis apa pun.');
  }
  const pp = await ping(PROD).catch(e => mati('Server produksi tidak menjawab: ' + e.message));
  console.log('       sumber menjawab env="' + pp.env + '" db="' + pp.db + '"');

  // ---------- 1. Ambil dari produksi ----------
  const src = await api(PROD, Object.assign({ action: 'listUsers' }, cred.prod))
    .catch(e => mati('Gagal membaca produksi: ' + e.message +
      (/forbidden/.test(e.message) ? ' (PROD_ADMIN harus superadmin — admin modul "*")' : '')));
  const users   = src.users   || [];
  const modules = src.modules || [];
  console.log('\nDibaca dari produksi: ' + users.length + ' user, ' + modules.length + ' modul.');

  // ---------- 2. Susun muatan import ----------
  const grants = [], admins = [];
  users.forEach(u => {
    /* `grants` mentah = yang dicentang; `denies` = pengecualian yang menimpa
       '*'. Keduanya baris di tabel yang sama, dibedakan kolom access. */
    (u.grants || []).forEach(m => grants.push({ userId: u.id, module: m, access: true,  grantedBy: 'tarik-prod' }));
    (u.denies || []).forEach(m => grants.push({ userId: u.id, module: m, access: false, grantedBy: 'tarik-prod' }));
    (u.adminModules || []).forEach(m => admins.push({ userId: u.id, module: m }));
  });
  const muatan = {
    action: 'import',
    users: users.map(u => ({
      id: u.id, name: u.name, pin: u.pin, active: u.active,
      keterangan: u.keterangan, talentaId: u.talentaId
    })),
    modules: modules.map(m => (typeof m === 'string'
      ? { key: m, label: m, active: true }
      : { key: m.key, label: m.label || m.key, active: m.active !== false })),
    grants: grants, admins: admins
  };

  // ---------- 3. Bandingkan dengan yang sudah ada di dev ----------
  const kini = await api(DEV, Object.assign({ action: 'listUsers' }, cred.dev))
    .catch(e => mati('Gagal membaca dev: ' + e.message +
      (/forbidden/.test(e.message) ? ' (DEV_ADMIN harus superadmin di DEV)' : '')));
  const adaDiDev = new Set((kini.users || []).map(u => u.id));
  const idProd   = new Set(users.map(u => u.id));
  const baru  = users.filter(u => !adaDiDev.has(u.id));
  const timpa = users.filter(u =>  adaDiDev.has(u.id));
  const hanyaDiDev = (kini.users || []).filter(u => !idProd.has(u.id));

  console.log('\nRENCANA');
  console.log('  ' + baru.length  + ' user baru di dev');
  console.log('  ' + timpa.length + ' user yang sudah ada → datanya ditimpa (nama, PIN, akses)');
  console.log('  ' + muatan.modules.length + ' modul, ' + grants.length + ' baris hak akses, ' + admins.length + ' admin modul');
  if (hanyaDiDev.length) {
    console.log('  ' + hanyaDiDev.length + ' user HANYA ADA DI DEV — dibiarkan, tidak dihapus:');
    hanyaDiDev.slice(0, 15).forEach(u => console.log('      · ' + u.name + ' (' + u.id + ')'));
    if (hanyaDiDev.length > 15) console.log('      · …dan ' + (hanyaDiDev.length - 15) + ' lagi');
  }

  if (!TERAPKAN) {
    console.log('\nTidak ada yang ditulis. Jalankan ulang dengan --terapkan kalau sudah benar.\n');
    return;
  }

  // ---------- 4. Tulis ke dev ----------
  const hasil = await api(DEV, Object.assign({}, muatan, cred.dev))
    .catch(e => mati('Import ke dev gagal: ' + e.message));
  console.log('\nImport selesai: ' + JSON.stringify(hasil.diproses || {}));

  /* KREDENSIAL PEMANGGIL BISA MATI DI TENGAH JALAN — dan pernah kejadian
     (7 Agustus 2026): akun yang dipakai untuk menulis ke dev ikut termasuk
     yang ditimpa, PIN-nya berganti mengikuti produksi, dan SELURUH panggilan
     berikutnya ditolak `forbidden`. Bukan galat yang menjelaskan dirinya:
     yang terbaca di layar cuma tiga puluh nama yang gagal.

     Perbaikannya bukan menyuruh orang mengingat PIN barunya, tapi mengambil
     sendiri PIN itu dari data yang BARU SAJA kita salin — sumbernya sudah ada
     di tangan. */
  const cariPin = function(nama){
    const n = String(nama || '').trim().toLowerCase();
    const u = users.find(x => String(x.username || '').trim().toLowerCase() === n && n !== '')
           || users.find(x => String(x.name || '').trim().toLowerCase() === n);
    return u ? { pin: u.pin, admin: (u.adminModules || []).indexOf('*') > -1 } : null;
  };
  const akun = cariPin(cred.dev.callerName);
  if (akun && akun.pin && akun.pin !== cred.dev.callerPin) {
    console.log('  PIN akun "' + cred.dev.callerName + '" di dev ikut tertimpa oleh PIN produksi —'
      + ' kredensial untuk langkah berikutnya disesuaikan sendiri.');
    cred.dev.callerPin = akun.pin;
  }
  if (akun && !akun.admin) {
    console.log('  Peringatan: di produksi, "' + cred.dev.callerName + '" BUKAN superadmin. Sesudah impor ini'
      + ' ia juga bukan superadmin di dev, jadi langkah berikutnya akan ditolak.'
      + ' Jalankan ulang dengan DEV_ADMIN/DEV_PIN yang sama dengan PROD_ADMIN/PROD_PIN.');
  }

  /* Susulan: username & no HP. `import` tidak membawa keduanya (bentuknya
     dirancang untuk impor dari Sheet lama yang memang tidak punya kolom itu),
     padahal username dipakai untuk login. Dikirim satu per satu lewat
     saveUser, dan HANYA untuk yang memang terisi di produksi — mengirim yang
     kosong akan menghapus yang sudah ada di dev tanpa alasan. */
  const perlu = users.filter(u => (u.username && u.username !== '') || (u.noHp && u.noHp !== ''));
  let ok = 0, gagal = [];
  for (const u of perlu) {
    try {
      await api(DEV, Object.assign({
        action: 'saveUser', id: u.id, name: u.name, pin: u.pin, active: u.active,
        keterangan: u.keterangan, noHp: u.noHp, talentaId: u.talentaId, username: u.username
      }, cred.dev));
      ok++;
    } catch(e) { gagal.push(u.name + ' — ' + e.message); }
  }
  console.log('Username & no HP: ' + ok + '/' + perlu.length + ' tersalin.');
  if (gagal.length) {
    /* Semua gagal dengan sebab yang sama = masalahnya kredensial, bukan
       datanya. Ditulis sekali sebagai kalimat, bukan tiga puluh baris nama
       yang menyembunyikan satu-satunya hal yang perlu dibaca. */
    const semuaForbidden = gagal.length === perlu.length && gagal.every(x => /forbidden/.test(x));
    if (semuaForbidden) {
      console.log('  SEMUANYA ditolak `forbidden` — itu masalah kredensial, bukan datanya.');
      console.log('  Data pokoknya SUDAH masuk lewat import di atas; yang belum hanya username & no HP.');
      console.log('  Jalankan ulang dengan DEV_ADMIN/DEV_PIN yang sama persis dengan PROD_ADMIN/PROD_PIN');
      console.log('  (sesudah impor, login dev memang sama dengan login produksi).');
    } else {
      console.log('  Yang gagal (datanya tetap masuk lewat import, cuma username/HP-nya belum):');
      gagal.forEach(x => console.log('      · ' + x));
    }
  }

  /* Pemeriksaan penutup tidak boleh menjatuhkan seluruh proses: pekerjaannya
     sudah selesai, ini cuma laporan. */
  try {
    const cek = await api(DEV, Object.assign({ action: 'listUsers' }, cred.dev));
    console.log('\nDev sekarang berisi ' + (cek.users || []).length + ' user.\n');
  } catch(e) {
    console.log('\n(Tidak bisa membaca ulang dev untuk memastikan: ' + e.message + ')\n');
  }
})().catch(e => {
  console.error('\n✗ ' + e.message + '\n');
  process.exitCode = 1;
});
