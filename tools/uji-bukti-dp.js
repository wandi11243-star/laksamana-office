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
  /* getAll DICATAT. Penjaga isian berdiri di ATAS panggilan itu, dan itu
     bukan soal kerapian: mejaMasihKosong() memasang overlay "Memeriksa
     ketersediaan meja…" lalu TIDAK menutupnya sendiri, jadi tiap `return` di
     bawahnya yang lupa hideBusy() menggantungkan layar — dilaporkan user
     20 September 2026 untuk penjaga nominal yang baru dipasang, dan penjaga
     bukti sudah begitu sejak 6 September 2026. */
  const jejak = { toast: [], confirm: 0, simpan: 0, getAll: 0 };
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
        if (u.indexOf('getAll') > -1 || (body && body.action === 'getAll')) jejak.getAll++;
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
  set('dpAmount', opt.nominal === undefined ? '500.000' : opt.nominal);
  const r = d.querySelector('input[name=dpStatus][value="' + (opt.dp ? 'Sudah' : 'Belum') + '"]');
  if (r) r.checked = true;
  return true;
}

(async () => {
  /* ============ 1. sumber: tanda wajib & keterangannya ============ */
  console.log('\n== Label & keterangan ==');
  /* DIJEPIT ke kotaknya sendiri. Frasa yang sama juga hidup di modal Tambah
     DP, jadi asersi yang menyapu seluruh berkas cocok dengan label yang BUKAN
     yang diuji — dan mutasi yang mencabut bintang di form reservasi lolos
     tanpa bunyi. Bentuk yang sudah menggigit berkali-kali di repo ini. */
  cek('label nominal DP di FORM RESERVASI bertanda wajib',
      (() => {
        const i = HTML.indexOf('<label>Nominal DP <span class="req">*</span></label>');
        return i > -1 && HTML.slice(i, i + 300).indexOf('name="dpAmount"') > -1;
      })());
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
    /* Yang dituntut: pesannya MENYEBUT apa yang kurang, bukan sekadar berbunyi
       'belum lengkap'. Pesan yang tidak menyebutnya membuat orang memeriksa
       kotak yang sebenarnya sudah benar. */
    cek('sebabnya dikatakan lewat toast',
        /bukti transfer/i.test(toastTerakhir(w)) && /wajib/i.test(toastTerakhir(w)), toastTerakhir(w));
    cek('yang TIDAK kurang tidak ikut disebut',
        !/nominal/i.test(toastTerakhir(w)), toastTerakhir(w));
    /* LAYARNYA TIDAK MENGGANTUNG. Inilah yang dilaporkan user 20 September
       2026: tombol Simpan ditekan, overlay "Memeriksa ketersediaan meja…"
       menyala, dan tidak ada apa pun yang terjadi lagi sampai halamannya
       dimuat ulang. Yang dibaca KELAS di DOM, bukan ada-tidaknya pemanggilan
       hideBusy() di sumber: rujukan yang benar di berkas tidak membuktikan
       ada overlay yang benar-benar tertutup. */
    cek('overlay TIDAK menggantung',
        !(w.document.getElementById('busyRoot') || { classList: { contains: () => false } })
          .classList.contains('on'));
    /* Yang belum pernah tersimpan tidak boleh cuma "ditanya" — pertanyaan yang
       bisa dijawab OK adalah gerbang yang tidak menahan apa pun. */
    cek('tidak sekadar ditanya confirm()', jejak.confirm === 0, jejak.confirm + '× confirm');
  }

  /* ============ 2b. NOMINAL DP kosong = ditolak (20 Sep 2026) ============
     DP bernominal nol ikut dijumlahkan halaman Dana Masuk, dan Rp0 di sana
     terbaca sebagai transfer yang nominalnya gagal dibaca — bukan sebagai
     angka yang memang belum diketahui. Yang diuji JUMLAH BARIS TERSIMPAN,
     bukan ada-tidaknya toast: itu satu-satunya yang bisa membedakan
     "ditahan" dari "diperingatkan lalu tetap disimpan". */
  console.log('\n== Reservasi baru: DP tanpa nominal ==');
  {
    const { w, jejak } = dom({});
    await masuk(w);
    tangkapToast(w);
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    w.eval('newReservation()');
    await tunggu(120);
    isiForm(w, { tgl: besok, dp: true, nominal: '' });
    /* Buktinya ADA — jadi yang menahan simpannya pasti nominalnya, bukan
       penjaga bukti yang sudah ada sejak 6 September 2026. Tanpa ini
       asersinya hampa: keduanya kurang, dan yang berbunyi bisa saja yang
       lama. */
    w.eval('PENDING_FILES.dpProofData={data:"data:image/jpeg;base64,AAA",name:"struk.jpg"};');
    const sebelum = w.eval('STATE.reservations.length');
    /* Dinolkan tepat sebelum tombolnya ditekan: boot modul ini sendiri sudah
       memanggil getAll sekali, dan menghitung dari nol akan menuduh
       penjaganya untuk panggilan yang bukan miliknya. */
    jejak.getAll = 0;
    await w.eval('saveReservation()');
    await tunggu(140);
    cek('reservasi TIDAK tersimpan', w.eval('STATE.reservations.length') === sebelum,
        sebelum + ' -> ' + w.eval('STATE.reservations.length'));
    cek('yang disebut NOMINAL, bukan bukti', /nominal/i.test(toastTerakhir(w)), toastTerakhir(w));
    cek('bukti yang sudah ada tidak ikut dituduh kurang',
        !/bukti/i.test(toastTerakhir(w)), toastTerakhir(w));
    cek('tidak sekadar ditanya confirm()', jejak.confirm === 0, jejak.confirm + '× confirm');
    cek('overlay TIDAK menggantung',
        !(w.document.getElementById('busyRoot') || { classList: { contains: () => false } })
          .classList.contains('on'));
    /* PENJAGANYA BERDIRI DI ATAS PANGGILAN SERVER. Formulir yang akan ditolak
       karena isiannya kurang tidak membuang satu getAll penuh lebih dulu —
       dan selama ia di atas, tidak ada overlay yang perlu diingat siapa pun.
       Asersinya baru berarti karena putaran berikutnya membuktikan getAll
       MEMANG dipanggil kalau isiannya lengkap. */
    cek('server tidak ditanyai untuk formulir yang kurang', jejak.getAll === 0,
        jejak.getAll + '× getAll');

    /* Diisi nominalnya -> lolos. Tanpa putaran ini, penjaga yang menolak
       APA PUN tetap hijau di seluruh asersi di atas. */
    const f = w.document.getElementById('resForm');
    if (f && f.elements['dpAmount']) f.elements['dpAmount'].value = '250.000';
    await w.eval('saveReservation()');
    await tunggu(160);
    cek('nominal diisi -> tersimpan', w.eval('STATE.reservations.length') === sebelum + 1,
        sebelum + ' -> ' + w.eval('STATE.reservations.length'));
    cek('nominalnya ikut tercatat',
        w.eval('Number((STATE.reservations[STATE.reservations.length-1]||{}).dpAmount||0)') === 250000);
    /* Yang membuat asersi "server tidak ditanyai" di atas tidak hampa: kalau
       isiannya lengkap, mejanya MEMANG dicek ke server. */
    cek('yang lengkap TETAP dicek mejanya ke server', jejak.getAll > 0,
        jejak.getAll + '× getAll');
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
      cek('pertanyaannya menyebut sebabnya', /tanpa bukti transfer/i.test(jejak.pesanConfirm || ''),
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
