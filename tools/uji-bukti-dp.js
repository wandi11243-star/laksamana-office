/* Uji "bukti DP wajib" di modul Reservasi — 6 September 2026, permintaan user:
   "setiap input reservasi terus jika dia masukin DP, wajib upload foto
   buktinya, dibuat mandatory".

   KENAPA UJI SENDIRI. `tools/smoke-modul.js` melaporkan modul ini sebagai
   "hanya boot yang diuji" — tidak satu pun halamannya dirender, apalagi
   jalur simpannya. Gerbang yang menyentuh UANG karena itu tidak punya jaring
   sama sekali sebelum berkas ini ada.

   YANG DIJAGA:

     - DP tanpa bukti DITOLAK, dan reservasinya benar-benar tidak masuk.
       Gerbang yang cuma memasang toast tapi tetap menyimpan adalah gerbang
       yang tidak menahan apa pun.
     - Bukti yang SUDAH TERSIMPAN ikut dihitung. Menyunting nama tamu pada
       reservasi yang buktinya sudah ada tidak boleh menuntut berkasnya
       diunggah ulang — berkas itu di database, bukan di komputer yang sedang
       membuka form.
     - Reservasi LAMA yang DP-nya terlanjur tanpa bukti tidak dikunci, cuma
       ditanya. Menguncinya berarti data yang sudah terlanjur begitu tidak
       bisa dibetulkan siapa pun, termasuk nama tamu yang salah ketik.
     - "Belum DP" tidak pernah menuntut bukti apa pun.
     - DP bertahap (modal Tambah DP) wajib TANPA pengecualian — cicilannya
       baru lahir saat itu juga, jadi tidak ada data lama yang bisa terkunci. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

/* Denah venue dimuat lewat <script src="../assets/venue-layouts.js"> dan modul
   ini SENGAJA berhenti keras kalau berkasnya tidak termuat — denah kosong yang
   diam jauh lebih berbahaya daripada pesan galat, karena tampak seperti "semua
   meja kosong". jsdom tidak mengambil skrip eksternal, jadi isinya disisipkan
   sebagai skrip inline menggantikan tag src-nya: yang dijalankan tetap berkas
   aslinya, bukan tiruan yang bisa menyimpang dari koordinat sebenarnya. */
const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const HTML_UJI = HTML.replace(
  '<script src="../assets/venue-layouts.js"><' + '/script>',
  () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === HTML) { console.error('tag venue-layouts.js tidak ketemu di sumber'); process.exit(2); }
let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function dom(opt) {
  opt = opt || {};
  const jejak = { toast: [], confirm: 0, simpan: 0 };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {};
      /* confirm() dicatat DAN dijawab menurut opsi: yang diuji bukan cuma
         "ditolak/diterima", tapi apakah pertanyaannya benar-benar diajukan. */
      w.confirm = (m) => { jejak.confirm++; jejak.pesanConfirm = String(m || ''); return opt.confirmYa === true; };
      w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u-uji', name: 'Penguji',
          modules: ['reservasi'], adminModules: ['reservasi']
        }));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        if (body && (body.action === 'save' || body.action === 'saveAll')) jejak.simpan++;
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [
          { id: 'u-uji', name: 'Penguji', keterangan: 'Office', isModuleAdmin: true } ] });
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { w: d.window, jejak };
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof STATE !== "undefined" && STATE && Array.isArray(STATE.reservations)')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Reservasi tidak pernah siap');
}
/* SESSION diisi oleh alur SSO Office (resolveReservasiUser + enterApp) yang
   menuntut roster sungguhan. Yang diuji di berkas ini jalur SIMPAN, bukan
   gerbang masuknya, jadi sesinya disetel langsung — pola yang sama dengan
   uji-kelola-user.js, yang memanggil render panelnya langsung karena panel
   itu berdiri di balik gerbang PIN. Yang dijalankan sesudah ini tetap kode
   sungguhan: renderInput(), saveReservation(), saveAddDp(). */
async function masuk(w) {
  await siap(w);
  w.eval('SESSION={id:"u-uji",name:"Penguji",role:"admin"}; SELECTED_CREW="u-uji";');
  await tunggu(40);
}
/* Toast ditangkap dengan menimpa fungsinya sesudah modul siap — ia
   dideklarasikan di lingkup skrip, bukan properti window, jadi harus lewat
   eval seperti S dan ME di modul lain. */
function tangkapToast(w) {
  w.eval('window.__toast=[]; toast=function(m,t){ window.__toast.push({m:String(m),t:t}); };');
}
const toastTerakhir = w => {
  const a = w.eval('JSON.stringify(window.__toast||[])');
  const arr = JSON.parse(a);
  return arr.length ? arr[arr.length - 1].m : '';
};
/* Form diisi seadanya lewat elemen sungguhan — yang diuji jalur simpan yang
   benar-benar dipakai orang, bukan objek yang disusun di uji. */
function isiForm(w, opt) {
  const d = w.document, f = d.getElementById('resForm');
  if (!f) return false;
  const set = (n, v) => { if (f.elements[n]) f.elements[n].value = v; };
  set('name', opt.nama || 'Tamu Uji');
  set('phone', '081234567890');
  set('date', opt.tgl);
  set('time', '19:00');
  set('pax', '4');
  set('table', 'A1');
  set('dpAmount', '500.000');
  const r = d.querySelector('input[name=dpStatus][value="' + (opt.dp ? 'Sudah' : 'Belum') + '"]');
  if (r) r.checked = true;
  return true;
}

(async () => {
  /* ============ 1. sumber: tanda wajib & keterangannya ============ */
  console.log('\n== Label & keterangan ==');
  cek('label bukti DP bertanda wajib',
      HTML.indexOf('Upload Bukti DP (foto/pdf) <span class="req">*</span>') > -1);
  cek('label bukti di modal Tambah DP bertanda wajib',
      HTML.indexOf('Upload Bukti Transfer (foto/pdf) <span class="req">*</span>') > -1);
  cek('sebabnya dikatakan, bukan cuma bintangnya',
      HTML.indexOf('tidak bisa dicocokkan') > -1);
  cek('dikatakan bukti tersimpan tidak perlu diulang',
      HTML.indexOf('tidak perlu diulang') > -1);
  /* Satu tempat yang memutuskan "sudah ada bukti" — dua pemeriksa yang
     berbeda akan menyimpang begitu bentuk datanya berubah. */
  cek('helper adaBuktiDp ada dan tunggal',
      (HTML.match(/function adaBuktiDp\(/g) || []).length === 1);
  cek('adaBuktiDp membaca KEDUA bentuk data',
      /r\.dpProofData/.test(HTML) && /dps\.some\(p=>p && p\.proofData\)/.test(HTML));

  /* ============ 2. reservasi BARU + DP tanpa bukti = ditolak ============ */
  console.log('\n== Reservasi baru: DP tanpa bukti ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('newReservation()');
    await tunggu(120);
    cek('form input tergambar', !!w.document.getElementById('resForm'));
    isiForm(w, { tgl: besok, dp: true });
    const sebelum = w.eval('STATE.reservations.length');
    await w.eval('saveReservation()');
    await tunggu(120);
    const sesudah = w.eval('STATE.reservations.length');

    cek('reservasi TIDAK tersimpan', sesudah === sebelum, sebelum + ' -> ' + sesudah);
    cek('sebabnya dikatakan lewat toast', /[Bb]ukti DP wajib/.test(toastTerakhir(w)), toastTerakhir(w));
    /* Yang belum pernah tersimpan tidak boleh cuma "ditanya" — pertanyaan yang
       bisa dijawab OK adalah gerbang yang tidak menahan apa pun. */
    cek('tidak sekadar ditanya confirm()', jejak.confirm === 0, jejak.confirm + '× confirm');
  }

  /* ============ 3. dengan bukti = lolos ============ */
  console.log('\n== Reservasi baru: DP dengan bukti ==');
  {
    const { w } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('newReservation()');
    await tunggu(120);
    isiForm(w, { tgl: besok, dp: true });
    /* Berkas yang sudah dibaca disimpan di PENDING_FILES — jalur yang sama
       dengan yang diisi fileToData() sesudah orang memilih berkas. */
    w.eval('PENDING_FILES.dpProofData={data:"data:image/jpeg;base64,AAA",name:"struk.jpg"};');
    const sebelum = w.eval('STATE.reservations.length');
    await w.eval('saveReservation()');
    await tunggu(160);
    cek('reservasi tersimpan', w.eval('STATE.reservations.length') === sebelum + 1);
    cek('buktinya ikut tercatat',
        w.eval('String((STATE.reservations[STATE.reservations.length-1]||{}).dpProofName||"")') === 'struk.jpg');
  }

  /* ============ 4. "Belum DP" tidak pernah menuntut bukti ============ */
  console.log('\n== Belum DP ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('newReservation()');
    await tunggu(120);
    isiForm(w, { tgl: besok, dp: false });
    const sebelum = w.eval('STATE.reservations.length');
    await w.eval('saveReservation()');
    await tunggu(160);
    cek('tersimpan tanpa diminta bukti', w.eval('STATE.reservations.length') === sebelum + 1);
    cek('tidak ada pertanyaan sama sekali', jejak.confirm === 0);
  }

  /* ============ 5. edit: bukti tersimpan tidak diminta ulang ============ */
  console.log('\n== Edit reservasi yang buktinya sudah ada ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('STATE.reservations.push({id:"r-lama",name:"Tamu Lama",phone:"081200000000",' +
           'date:"' + besok + '",time:"19:00",pax:4,table:"B2",status:"Confirmed",' +
           'dpStatus:"Sudah",dpAmount:500000,dpMethod:"",dpProofData:"data:image/jpeg;base64,AAA",' +
           'dpProofName:"lama.jpg",dps:[],createdAt:Date.now(),updatedAt:Date.now()});');
    w.eval('editReservation("r-lama")');
    await tunggu(140);
    isiForm(w, { tgl: besok, dp: true, nama: 'Tamu Lama Dibetulkan' });
    await w.eval('saveReservation()');
    await tunggu(160);
    cek('tersimpan tanpa upload ulang',
        w.eval('String((STATE.reservations.find(x=>x.id==="r-lama")||{}).name||"")') === 'Tamu Lama Dibetulkan');
    cek('tidak ditanya apa pun', jejak.confirm === 0, jejak.confirm + '× confirm');
    cek('bukti lama tidak hilang',
        w.eval('String((STATE.reservations.find(x=>x.id==="r-lama")||{}).dpProofName||"")') === 'lama.jpg');
  }

  /* ============ 6. data lama tanpa bukti: ditanya, tidak dikunci ============ */
  console.log('\n== Reservasi lama yang DP-nya tanpa bukti ==');
  for (const jawab of [false, true]) {
    const { w, jejak } = dom({ confirmYa: jawab });
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('STATE.reservations.push({id:"r-tanpa",name:"Tanpa Bukti",phone:"081211111111",' +
           'date:"' + besok + '",time:"19:00",pax:4,table:"C3",status:"Confirmed",' +
           'dpStatus:"Sudah",dpAmount:500000,dpMethod:"",dpProofData:"",dpProofName:"",dps:[],' +
           'createdAt:Date.now(),updatedAt:Date.now()});');
    w.eval('editReservation("r-tanpa")');
    await tunggu(140);
    isiForm(w, { tgl: besok, dp: true, nama: 'Dibetulkan' });
    await w.eval('saveReservation()');
    await tunggu(160);
    const nama = w.eval('String((STATE.reservations.find(x=>x.id==="r-tanpa")||{}).name||"")');
    if (!jawab) {
      cek('ditanya lebih dulu', jejak.confirm === 1, jejak.confirm + '×');
      cek('pertanyaannya menyebut sebabnya', /sebelum buktinya diwajibkan/.test(jejak.pesanConfirm || ''),
          (jejak.pesanConfirm || '').slice(0, 90));
      cek('dibatalkan -> tidak tersimpan', nama === 'Tanpa Bukti', nama);
    } else {
      cek('dilanjutkan -> tetap bisa disunting', nama === 'Dibetulkan', nama);
    }
  }

  /* ============ 7. DP bertahap wajib tanpa pengecualian ============ */
  console.log('\n== Modal Tambah DP (DP bertahap) ==');
  {
    const { w } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('STATE.reservations.push({id:"r-dp",name:"Cicil",phone:"081222222222",' +
           'date:"' + besok + '",time:"19:00",pax:4,table:"D4",status:"Confirmed",' +
           'dpStatus:"Sudah",dpAmount:100000,dpMethod:"",dpProofData:"data:image/jpeg;base64,AAA",' +
           'dpProofName:"a.jpg",dps:[{id:"p1",amount:100000,method:"",proofData:"data:image/jpeg;base64,AAA",proofName:"a.jpg"}],' +
           'createdAt:Date.now(),updatedAt:Date.now()});');
    w.eval('openAddDp("r-dp")');
    await tunggu(120);
    const box = w.document.getElementById('ndp_amount');
    cek('modal Tambah DP terbuka', !!box);
    if (box) box.value = '300.000';
    const sebelum = w.eval('(STATE.reservations.find(x=>x.id==="r-dp")||{dps:[]}).dps.length');
    await w.eval('saveAddDp("r-dp")');
    await tunggu(140);
    const sesudah = w.eval('(STATE.reservations.find(x=>x.id==="r-dp")||{dps:[]}).dps.length');
    cek('cicilan tanpa bukti DITOLAK', sesudah === sebelum, sebelum + ' -> ' + sesudah);
    cek('sebabnya dikatakan', /[Bb]ukti transfer wajib/.test(toastTerakhir(w)), toastTerakhir(w));

    /* dengan bukti: masuk */
    w.eval('PENDING_FILES.ndpProof={data:"data:image/jpeg;base64,BBB",name:"struk2.jpg"};');
    await w.eval('saveAddDp("r-dp")');
    await tunggu(160);
    cek('dengan bukti, cicilan masuk',
        w.eval('(STATE.reservations.find(x=>x.id==="r-dp")||{dps:[]}).dps.length') === sebelum + 1);
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
