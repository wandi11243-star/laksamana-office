/* ===========================================================================
   SAMAKAN HAK AKSES SATU MODUL: dev -> produksi
   ---------------------------------------------------------------------------
   MASALAH YANG DIPECAHKAN BERKAS INI

   Hak akses TIDAK ikut merge. Kode ada di git, tapi centang Kelola Akses ada
   di TABEL `grants` milik database akun — dan dev memakai
   lakk5493_db_dev_account sementara produksi memakai lakk5493_db_account.
   Dua database, dua isi. Merge `develop` -> `main` menyalin berkas, bukan
   baris database.

   Akibatnya selalu sama dan selalu membingungkan: modul barunya jalan mulus
   di dev karena di sana sudah dicentang, lalu di produksi tidak seorang pun
   bisa membukanya — tanpa satu pun galat, karena memang tidak ada yang
   rusak. Sudah kejadian 27 Agustus 2026 waktu modul `investor` naik.

   CARA PAKAI

     # 1) lihat rencananya dulu (tidak menulis apa pun, tidak butuh PIN)
     node tools/samakan-akses.js investor

     # 2) terapkan (butuh akun SUPERADMIN produksi)
     LM_ADMIN="Admin" LM_PIN="1234" node tools/samakan-akses.js investor --terapkan

   PIN dibaca dari environment, TIDAK PERNAH dari argumen baris perintah:
   argumen tercatat di riwayat shell dan di daftar proses mesin ini.

   YANG SENGAJA TIDAK DILAKUKAN

   Secara bawaan ia hanya MENAMBAH. Akses yang ada di produksi tapi tidak ada
   di dev cuma DILAPORKAN, tidak dicabut. Dev itu tempat main-main dan isinya
   rutin tertinggal; menjadikannya sumber kebenaran untuk pencabutan berarti
   satu percobaan di dev bisa memutus akses orang yang sedang bekerja di
   produksi. Kalau memang mau benar-benar identik, tambahkan `--cabut` dan
   baca dulu daftar yang akan dicabut.
   =========================================================================== */

const ARG = process.argv.slice(2);
const MODUL = ARG.find(a => !a.startsWith('--'));
const TERAPKAN = ARG.includes('--terapkan');
const CABUT = ARG.includes('--cabut');

const SUMBER  = { label:'DEV',      url:'https://dev.laksamanamuda.id/account-api-mysql/api.php' };
const TUJUAN  = { label:'PRODUKSI', url:'https://team.laksamanamuda.id/account-api-mysql/api.php' };

if (!MODUL) {
  console.error('Pakai: node tools/samakan-akses.js <kunci-modul> [--terapkan] [--cabut]');
  console.error('Contoh: node tools/samakan-akses.js investor');
  process.exit(2);
}

async function panggil(api, data) {
  const r = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data)
  });
  const t = await r.text();
  try { return JSON.parse(t); }
  catch (e) { throw new Error('balasan bukan JSON dari ' + api + ': ' + t.slice(0, 120)); }
}

/* Kunci pencocokan: id dulu, nama sebagai cadangan. Id di kedua database
   memang seragam (`u-howandi`), tapi akun yang dibuat terpisah bisa punya id
   berbeda dengan nama yang sama — dan orang yang tidak cocok lalu dilewati
   diam-diam persis kesalahan yang berkas ini diadakan untuk mencegah. */
const kunciNama = s => String(s || '').trim().toLowerCase();

(async () => {
  console.log('Modul       : ' + MODUL);
  console.log('Sumber      : ' + SUMBER.label);
  console.log('Tujuan      : ' + TUJUAN.label);
  console.log('Mode        : ' + (TERAPKAN ? 'TERAPKAN' + (CABUT ? ' + CABUT' : '') : 'rencana saja (tidak menulis apa pun)'));
  console.log('');

  const [srcMod, dstMod, dstAll] = await Promise.all([
    panggil(SUMBER.url, { action:'listModuleRoster', module: MODUL }),
    panggil(TUJUAN.url, { action:'listModuleRoster', module: MODUL }),
    panggil(TUJUAN.url, { action:'listDivisiRoster' })
  ]);
  for (const [n, r] of [['sumber', srcMod], ['tujuan', dstMod], ['roster tujuan', dstAll]]) {
    if (!r || !r.ok) throw new Error('gagal membaca ' + n + ': ' + JSON.stringify(r).slice(0, 160));
  }

  const src = srcMod.members || [];
  const dst = dstMod.members || [];
  const semua = dstAll.members || [];
  const petaId = new Map(semua.map(u => [String(u.id), u]));
  const petaNama = new Map(semua.map(u => [kunciNama(u.name), u]));
  const sudah = new Map(dst.map(u => [String(u.id), u]));

  const tambah = [], jadiAdmin = [], hilang = [], lebih = [];

  for (const u of src) {
    /* Akun harus ADA di produksi. setModuleAccess menerima id apa saja dan
       menulis barisnya tanpa mengeluh — hasilnya baris grant untuk orang
       yang tidak ada, yang tidak pernah kelihatan di layar mana pun. */
    const t = petaId.get(String(u.id)) || petaNama.get(kunciNama(u.name));
    if (!t) { hilang.push(u); continue; }
    const ada = sudah.get(String(t.id));
    if (!ada) tambah.push({ dari:u, ke:t });
    if (u.isModuleAdmin && !(ada && ada.isModuleAdmin)) jadiAdmin.push({ dari:u, ke:t });
  }
  const idSumber = new Set(src.flatMap(u => {
    const t = petaId.get(String(u.id)) || petaNama.get(kunciNama(u.name));
    return t ? [String(t.id)] : [];
  }));
  for (const u of dst) if (!idSumber.has(String(u.id))) lebih.push(u);

  const baris = u => '  - ' + (u.name || '(tanpa nama)') + '  [' + u.id + ']'
                   + (u.keterangan ? '  (' + u.keterangan + ')' : '');

  console.log(SUMBER.label + ' punya ' + src.length + ' pemegang, ' + TUJUAN.label + ' punya ' + dst.length + '.');
  console.log('');
  console.log('AKAN DIBERI AKSES (' + tambah.length + ')');
  tambah.length ? tambah.forEach(x => console.log(baris(x.ke))) : console.log('  (tidak ada)');
  console.log('');
  console.log('AKAN DIJADIKAN ADMIN MODUL (' + jadiAdmin.length + ')');
  jadiAdmin.length ? jadiAdmin.forEach(x => console.log(baris(x.ke))) : console.log('  (tidak ada)');
  if (hilang.length) {
    console.log('');
    console.log('TIDAK ADA AKUNNYA DI ' + TUJUAN.label + ' — DILEWATI (' + hilang.length + ')');
    hilang.forEach(u => console.log(baris(u)));
  }
  if (lebih.length) {
    console.log('');
    console.log('ADA DI ' + TUJUAN.label + ' TAPI TIDAK DI ' + SUMBER.label + ' (' + lebih.length + ')');
    lebih.forEach(u => console.log(baris(u)));
    console.log(CABUT ? '  -> akan DICABUT karena --cabut diberikan.'
                      : '  -> DIBIARKAN. Tambahkan --cabut kalau memang mau dicabut.');
  }

  if (!TERAPKAN) {
    console.log('');
    console.log('Rencana saja — belum ada yang ditulis.');
    console.log('Jalankan ulang dengan: LM_ADMIN="<nama>" LM_PIN="<pin>" node tools/samakan-akses.js ' + MODUL + ' --terapkan');
    return;
  }

  const nama = process.env.LM_ADMIN || '';
  const pin  = process.env.LM_PIN || '';
  if (!nama || !pin) {
    console.error('\nLM_ADMIN dan LM_PIN harus diisi untuk --terapkan (akun superadmin PRODUKSI).');
    process.exit(2);
  }

  let ok = 0, err = 0;
  const kirim = async (aksi, userId, access, ket) => {
    const r = await panggil(TUJUAN.url, {
      action: aksi, callerName: nama, callerPin: pin,
      userId, module: MODUL, access
    });
    if (r && r.ok) { ok++; console.log('  OK    ' + ket); }
    else {
      err++;
      const e = (r && r.error) || '?';
      console.log('  GAGAL ' + ket + '  -> ' + e);
      /* PIN salah menggagalkan SEMUA baris dengan pesan yang sama. Berhenti
         di percobaan pertama, kalau tidak layarnya penuh 6 baris "forbidden"
         yang terbaca seolah enam orangnya bermasalah satu per satu. */
      if (e === 'forbidden') { console.error('\nAkun/PIN superadmin ditolak. Berhenti.'); process.exit(1); }
    }
  };

  console.log('\nMenerapkan...');
  for (const x of tambah)    await kirim('setModuleAccess', x.ke.id, true,  'akses  ' + x.ke.name);
  for (const x of jadiAdmin) await kirim('setAdmin',        x.ke.id, true,  'admin  ' + x.ke.name);
  if (CABUT) for (const u of lebih) await kirim('setModuleAccess', u.id, false, 'cabut  ' + u.name);

  /* Diperiksa ulang dari server, bukan dari hitungan sendiri: yang menentukan
     berhasil atau tidak adalah isi database, dan "6 permintaan terkirim"
     bukan jawaban atas pertanyaan itu. */
  const cek = await panggil(TUJUAN.url, { action:'listModuleRoster', module: MODUL });
  console.log('\nSelesai: ' + ok + ' berhasil, ' + err + ' gagal.');
  console.log(TUJUAN.label + ' sekarang punya ' + ((cek.members || []).length) + ' pemegang kunci `' + MODUL + '`.');
  process.exit(err ? 1 : 0);
})().catch(e => { console.error('\nGALAT: ' + e.message); process.exit(1); });
