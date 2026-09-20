/* uji-dp-form-marketing.js — DP di modul Marketing: bukti, rekening, Dana Masuk
 *
 *   node tools/uji-dp-form-marketing.js
 *   JSDOM_PATH=/jalur/ke/jsdom node tools/uji-dp-form-marketing.js
 *
 * PERMINTAAN USER 20 September 2026: DP yang diisi di modul Marketing wajib
 * punya bukti transfer & rekening tujuannya, dan harus muncul di halaman Dana
 * Masuk milik kasir.
 *
 * YANG DITEMUKAN SAAT MENGERJAKANNYA, dan itu lebih penting daripada
 * fiturnya: centang "DP sudah dibayar" di tab Finance sampai tanggal itu cuma
 * PERNYATAAN TELANJANG. Ia menggeser Sisa Pelunasan lewat dpDiakui, tapi tidak
 * pernah membuat satu baris pun di `ev.payments` — sementara dp_masuk() di
 * backend HANYA membaca payments[]. Jadi DP event yang uangnya benar-benar
 * sudah diterima tidak pernah muncul di Dana Masuk, dan tidak punya bukti
 * maupun rekening tujuan di mana pun.
 *
 * YANG DIJAGA DI SINI:
 *   - centang TIDAK BISA dinyalakan tanpa nominal + rekening + tanggal + bukti;
 *   - yang lengkap MELAHIRKAN satu baris payments bertipe DP, dan
 *     MEMPERBARUINYA — bukan menumpuk tiap kali Simpan ditekan;
 *   - mematikan centang MEMBUANG barisnya (ditanya dulu), supaya Dana Masuk
 *     tidak memajang DP yang layarnya sendiri bilang belum masuk;
 *   - menghapus barisnya dari daftar pembayaran ikut melepas centangnya —
 *     kalau tidak, simpan berikutnya MELAHIRKANNYA LAGI;
 *   - Reservasi VIP: tiap bukti wajib punya nominal & rekening tujuan.
 *
 * YANG DIUKUR JUMLAH BARIS `payments`, bukan pesan di layar: itu satu-satunya
 * yang bisa membedakan "ditahan" dari "diperingatkan lalu tetap dicatat".
 */
'use strict';
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

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const sama = (n, d, h) => cek(n, d === h, 'dapat ' + JSON.stringify(d) + ', harusnya ' + JSON.stringify(h));
/* Blok yang bisa melempar dibungkus: satu asersi yang jatuh membunuh seluruh
   berkas, dan mutasinya lalu terbaca "uji tidak selesai" — bukan
   "tertangkap". Sudah menggigit lima kali di repo ini. */
const aman = async (n, fn) => { try { await fn(); } catch (e) { gagal++; console.log('  GAGAL ' + n + '  — melempar: ' + e.message); } };

const HTML_SUMBER = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');
const tanpaKomentar = HTML_SUMBER
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '');

/* opsi: { unggahGagal } */
function buka(opsi) {
  opsi = opsi || {};
  const html = HTML_SUMBER
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const jejak = { simpan: 0, payload: null, unggah: 0, confirm: 0, pesanConfirm: '', jawabConfirm: true };
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        id: 'u-devani', name: 'Devani Azahra', modules: ['marketing'], adminModules: ['marketing'],
        token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});    // boot tidak boleh menembak jaringan
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.confirm = (m) => { jejak.confirm++; jejak.pesanConfirm = String(m || ''); return jejak.jawabConfirm; };
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  const balas = o => { const t = JSON.stringify(o); return Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(JSON.parse(t)), text: () => Promise.resolve(t) }); };
  w.fetch = (url, opts) => {
    let b = {}; try { b = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    if (b.action === 'uploadReceipt') {
      jejak.unggah++;
      if (opsi.unggahGagal) return balas({ ok: false, error: 'disk penuh' });
      return balas({ ok: true, data: { key: 'k-' + jejak.unggah, name: b.fileName } });
    }
    if (b.action === 'saveAll') { jejak.simpan++; jejak.payload = b.data; }
    return balas({ ok: true, data: { saved: true, bentrok: [], versi: {} } });
  };
  /* S & ME `let` di lingkup leksikal global — bukan properti window. */
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = [{ id:'u-devani', name:'Devani Azahra', div:'Marketing', role:'marketing' }];
    ME = S.users[0]; ME.role = 'super_admin';
    S.clients = [{ id:'c1', nama:'PT Uji', perusahaan:'PT Uji', hp:'0811' }];
    S.events = [{
      id:'E1', nama:'Acara Uji', jenis:'Corporate Event', tanggal:'2026-10-10',
      pax:50, clientId:'c1', status:'Deal', mktPIC:'u-devani', payments:[],
      detail:{ nama:'Acara Uji', jenis:'Corporate Event', tanggal:'2026-10-10', pax:50,
               depositNominal:5000000, rincianItem:[{ket:'Paket',qty:1,harga:20000000}] },
      tasks:{}, createdAt:Date.now(), updatedAt:Date.now()
    }];
  `);
  return { w, jejak };
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const bayar = w => JSON.parse(w.eval('JSON.stringify((S.events[0].payments)||[])'));
const detail = w => JSON.parse(w.eval('JSON.stringify(S.events[0].detail||{})'));
const toastTeks = w => { const n = w.document.querySelectorAll('#toasts .toast'); return n.length ? n[n.length - 1].textContent : ''; };

/* Membuka tab Finance event lewat jalur yang benar-benar dipakai orang.
   Memanggil financeTab() langsung tidak menyetel _asEvId, dan seluruh
   penangan di tab ini membacanya — asersinya lalu menguji fungsi yang tidak
   pernah menemukan event-nya. */
async function bukaFinance(w) {
  w.eval("curTab='finance'; go('event','E1');");
  await tunggu(150);
  return !!w.document.getElementById('efd_dpPaid');
}
/* Mengisi ketiga kotak lewat DOM + penangannya sendiri, bukan dengan menulis
   ke ev.detail: yang diuji jalur yang dipakai orang. Bukti disuntikkan lewat
   jalur unggah sungguhan (dpBuktiPilih) di bloknya sendiri. */
function isiRek(w, rek, tgl) {
  const r = w.document.getElementById('efd_dpRek');
  const t = w.document.getElementById('efd_dpTgl');
  if (r) r.value = rek;
  if (t) t.value = tgl;
  w.eval('dpFormUbah()');
}
function centang(w, on) {
  const c = w.document.getElementById('efd_dpPaid');
  if (!c) return false;
  c.checked = !!on;
  w.eval('dpPaidUbah()');
  return true;
}

(async () => {

/* ================= 1. SUMBER: kotaknya ada, dan daftarnya tunggal ============ */
console.log('\n== Sumber ==');
cek('kotak rekening tujuan ada', tanpaKomentar.indexOf("id=\"efd_dpRek\"") > -1);
cek('kotak tanggal transfer ada', tanpaKomentar.indexOf("id=\"efd_dpTgl\"") > -1);
cek('kotak bukti transfer ada', tanpaKomentar.indexOf("id=\"efd_dpBukti\"") > -1);
/* SATU DAFTAR REKENING untuk Reservasi VIP dan tab Finance. Daftar kedua
   berisi rekening yang sama pasti menyimpang suatu hari, dan yang menyimpang
   adalah rekening yang disebut dua layar berbeda untuk satu transfer. */
cek('daftar rekening tunggal (DP_REKENING)',
    (tanpaKomentar.match(/const DP_REKENING=/g) || []).length === 1);
cek('nama lama VIP_DP_METODE sudah tidak dipakai',
    tanpaKomentar.indexOf('VIP_DP_METODE') === -1);
cek('dipakai KEDUA layar (VIP + tab Finance)',
    (tanpaKomentar.match(/DP_REKENING\.map/g) || []).length === 2);
/* Satu tempat yang memutuskan apa yang kurang — gerbang centang, penjaga
   Simpan, dan kalimat keterangannya wajib membaca yang sama. */
cek('dpFormKurang ada dan tunggal',
    (tanpaKomentar.match(/function dpFormKurang\(/g) || []).length === 1);
cek('barisnya dikenali lewat penanda, bukan type/tanggal',
    /p\.dariDpForm/.test(tanpaKomentar));

/* ================= 2. CENTANG DITOLAK saat belum lengkap ================== */
console.log('\n== Centang tanpa bukti & rekening ==');
await aman('blok centang-kurang', async () => {
  const { w, jejak } = buka();
  cek('tab Finance tergambar', await bukaFinance(w));
  const sebelum = bayar(w).length;
  centang(w, true);
  await tunggu(60);
  cek('centang dikembalikan MATI', w.document.getElementById('efd_dpPaid').checked === false);
  cek('dpPaid TIDAK tersimpan true', !w.eval('!!(S.events[0].detail.dpPaid&&S.events[0].detail.dpPaid.v)'));
  sama('tidak ada baris pembayaran yang lahir', bayar(w).length, sebelum);
  /* Pesannya menyebut APA yang kurang. Yang cuma berbunyi "belum lengkap"
     membuat orang memeriksa kotak yang sebenarnya sudah benar. */
  const t = toastTeks(w);
  cek('menyebut rekening tujuan', /rekening tujuan/i.test(t), t);
  cek('menyebut tanggal transfer', /tanggal transfer/i.test(t), t);
  cek('menyebut bukti transfer', /bukti transfer/i.test(t), t);
  /* Nominalnya SUDAH terisi di fixture, jadi ia tidak boleh ikut dituduh.
     Tanpa asersi ini, pesan yang menyebut seluruh kotak apa adanya lolos. */
  cek('nominal yang sudah terisi tidak ikut dituduh', !/nominal/i.test(t), t);

  /* KETERANGAN DI BAWAH CENTANG MENYEBUTNYA JUGA — sebelum tombolnya
     ditekan. Centang yang menolak dinyalakan tanpa mengatakan sebabnya lebih
     dulu terbaca sebagai centang yang rusak; itu persis keluhan yang
     melahirkan kalimat itu pada 13 Agustus 2026. Diuji pada cabang CENTANG
     MATI, yang berbeda dari cabang event lama di blok 6 — tanpa ini,
     separuh kalimatnya tidak dijaga sama sekali. */
  const ket = (w.document.getElementById('efd_dpPaidKet') || {}).textContent || '';
  cek('keterangan (centang mati) menyebut rekening tujuan', /rekening tujuan/i.test(ket), ket.slice(0, 160));
  cek('keterangan (centang mati) menyebut bukti transfer', /bukti transfer/i.test(ket), ket.slice(0, 160));
  cek('keterangan (centang mati) menyebut Dana Masuk', /Dana Masuk/.test(ket), ket.slice(0, 160));
});

/* ================= 3. LENGKAP -> lahir baris pembayaran ================== */
console.log('\n== Lengkap: lahir di payments (jalur ke Dana Masuk) ==');
await aman('blok lengkap', async () => {
  const { w, jejak } = buka();
  await bukaFinance(w);
  isiRek(w, 'Transfer UOB', '2026-09-15');
  /* Bukti lewat jalur unggah SUNGGUHAN — bukan dengan menulis dpBuktiUrl.
     Yang diuji termasuk bahwa alamat buktinya benar-benar sampai ke ev. */
  const inp = w.document.getElementById('efd_dpBukti');
  Object.defineProperty(inp, 'files', { value: [{ name: 'struk.jpg', type: 'image/jpeg', size: 1024 }], configurable: true });
  w.eval('fileToBase64=function(){ return Promise.resolve("AAA"); };');
  await w.eval('dpBuktiPilih(document.getElementById("efd_dpBukti"))');
  await tunggu(120);
  cek('bukti terunggah sekali', jejak.unggah === 1, 'unggah=' + jejak.unggah);
  cek('alamat buktinya tersimpan di event', /action=receipt/.test(detail(w).dpBuktiUrl || ''), detail(w).dpBuktiUrl);
  cek('nama berkasnya tersimpan', detail(w).dpBuktiNama === 'struk.jpg', detail(w).dpBuktiNama);
  /* DISIMPAN SEKETIKA: berkasnya sudah di server, tapi alamatnya baru ada di
     memori halaman ini. Menutup tab sekarang membuat buktinya jadi berkas
     yatim yang tidak ditunjuk baris mana pun. */
  cek('langsung ikut tersimpan, tidak menunggu tombol', jejak.simpan > 0, 'simpan=' + jejak.simpan);

  centang(w, true);
  await tunggu(60);
  cek('centang menyala', w.document.getElementById('efd_dpPaid').checked === true);
  const p = bayar(w);
  sama('lahir SATU baris pembayaran', p.length, 1);
  if (p.length) {
    sama('bertipe DP', p[0].type, 'DP');
    sama('nominalnya dari DP / Uang Muka', p[0].amount, 5000000);
    sama('rekening tujuannya ikut', p[0].method, 'Transfer UOB');
    sama('tanggal transfernya ikut', p[0].at, '2026-09-15');
    cek('buktinya ikut', /action=receipt/.test(p[0].receiptUrl || ''), p[0].receiptUrl);
    cek('ditandai lahir dari form DP', p[0].dariDpForm === true);
    /* dp_masuk() di backend MEMBUANG pembayaran tanpa tanggal — barisnya
       tidak akan pernah muncul di rentang mana pun. Tanggal wajib justru
       supaya keadaan itu tidak bisa terjadi. */
    cek('punya tanggal (tanpa itu dp_masuk membuangnya)', !!p[0].at);
    cek('punya nomor kwitansi sendiri', !!p[0].no, p[0].no);
  }

  /* MEMPERBARUI, BUKAN MENUMPUK. Tanpa ini tiap Simpan melahirkan satu baris
     DP lagi, dan di Dana Masuk satu transfer berdiri lima kali dengan nominal
     yang sama — masing-masing kelihatan wajar. */
  w.eval("saveEventTab('E1')");
  await tunggu(150);
  await bukaFinance(w);
  w.eval("saveEventTab('E1')");
  await tunggu(150);
  sama('dua kali Simpan tetap SATU baris', bayar(w).length, 1);

  /* Nominalnya diubah -> barisnya ikut, tidak tertinggal di angka lama. */
  await bukaFinance(w);
  const box = w.document.getElementById('efd_dpNominal');
  if (box) { box.value = '7.500.000'; }
  w.eval("saveEventTab('E1')");
  await tunggu(150);
  sama('nominal yang diubah ikut ke barisnya', (bayar(w)[0] || {}).amount, 7500000);
  sama('tetap satu baris', bayar(w).length, 1);
});

/* ================= 4. CENTANG DILEPAS -> barisnya dibuang ================ */
console.log('\n== Centang dilepas ==');
await aman('blok lepas centang', async () => {
  const { w, jejak } = buka();
  w.eval(`
    S.events[0].detail.dpRek='QRIS BRI';
    S.events[0].detail.dpTgl='2026-09-14';
    S.events[0].detail.dpBuktiUrl='https://x/?action=receipt&key=k1';
    S.events[0].detail.dpBuktiNama='a.jpg';
    S.events[0].detail.dpPaid={v:true};
    S.events[0].payments=[{id:'p1',no:'KW/0001',type:'DP',amount:5000000,method:'QRIS BRI',
      at:'2026-09-14',receipt:'a.jpg',receiptUrl:'https://x/?action=receipt&key=k1',
      verified:true,by:'Devani Azahra',dariDpForm:true}];
  `);
  await bukaFinance(w);
  cek('centang tergambar menyala', w.document.getElementById('efd_dpPaid').checked === true);

  /* DITANYA DULU, dan pertanyaannya MENYEBUT nominal & nomor kwitansinya:
     pertanyaan tanpa isi cuma melatih orang menekan OK. */
  jejak.jawabConfirm = false;
  centang(w, false);
  await tunggu(60);
  sama('dibatalkan -> barisnya TETAP ada', bayar(w).length, 1);
  cek('centang dikembalikan menyala', w.document.getElementById('efd_dpPaid').checked === true);
  cek('dpPaid tetap true', w.eval('!!(S.events[0].detail.dpPaid&&S.events[0].detail.dpPaid.v)'));
  cek('pertanyaannya menyebut nominalnya', /5\.000\.000/.test(jejak.pesanConfirm), jejak.pesanConfirm.slice(0, 120));
  cek('pertanyaannya menyebut nomor kwitansinya', /KW\/0001/.test(jejak.pesanConfirm));

  jejak.jawabConfirm = true;
  centang(w, false);
  await tunggu(60);
  sama('dilanjutkan -> barisnya dibuang', bayar(w).length, 0);
  cek('dpPaid jadi false', !w.eval('!!(S.events[0].detail.dpPaid&&S.events[0].detail.dpPaid.v)'));
  /* Buktinya TIDAK ikut dibuang: berkasnya sudah di server, dan mencabut
     tautannya membuatnya jadi berkas yatim. Yang dinyatakan cuma uangnya
     belum masuk. */
  cek('buktinya tetap tersimpan', !!detail(w).dpBuktiUrl);
});

/* ============ 5. BARISNYA DIHAPUS dari daftar pembayaran ============ */
console.log('\n== Baris dihapus lewat daftar pembayaran ==');
await aman('blok hapus payment', async () => {
  const { w, jejak } = buka();
  w.eval(`
    S.events[0].detail.dpRek='QRIS BRI';
    S.events[0].detail.dpTgl='2026-09-14';
    S.events[0].detail.dpBuktiUrl='https://x/?action=receipt&key=k1';
    S.events[0].detail.dpBuktiNama='a.jpg';
    S.events[0].detail.dpPaid={v:true};
    S.events[0].payments=[{id:'p1',no:'KW/0001',type:'DP',amount:5000000,method:'QRIS BRI',
      at:'2026-09-14',receiptUrl:'https://x/?action=receipt&key=k1',
      verified:true,by:'Devani Azahra',dariDpForm:true}];
  `);
  w.eval("deletePayment('E1','p1')");
  await tunggu(150);
  sama('barisnya terhapus', bayar(w).length, 0);
  /* CENTANGNYA IKUT DILEPAS. Kalau tidak, penyimpanan berikutnya
     MELAHIRKANNYA LAGI lewat dpFormSinkron — baris yang barusan dihapus
     muncul kembali dengan nomor kwitansi baru, dan yang menghapusnya
     menyimpulkan tombolnya rusak. */
  cek('centang DP ikut dilepas', !w.eval('!!(S.events[0].detail.dpPaid&&S.events[0].detail.dpPaid.v)'));
  cek('pertanyaannya menyebut akibatnya', /centangnya ikut dilepas/i.test(jejak.pesanConfirm),
      jejak.pesanConfirm.slice(0, 140));
  await bukaFinance(w);
  w.eval("saveEventTab('E1')");
  await tunggu(150);
  sama('simpan berikutnya TIDAK melahirkannya lagi', bayar(w).length, 0);
});

/* ============ 6. EVENT LAMA tidak dikunci, tapi tidak melahirkan ============ */
console.log('\n== Event lama: dpPaid true tanpa bukti ==');
await aman('blok event lama', async () => {
  const { w } = buka();
  /* Bentuk yang ADA di produksi: centangnya menyala dari masa ia cuma
     pernyataan telanjang — tanpa rekening, tanggal, maupun bukti. */
  w.eval("S.events[0].detail.dpPaid={v:true};");
  await bukaFinance(w);
  w.eval("S.events[0].nama='Acara Uji Disunting'; saveEventTab('E1')");
  await tunggu(160);
  /* TIDAK DIKUNCI: menguncinya berarti event yang sudah terlanjur begitu
     tidak bisa disunting siapa pun — termasuk nama acaranya. */
  cek('tetap bisa disimpan', w.eval("String(S.events[0].nama)") === 'Acara Uji Disunting',
      w.eval("String(S.events[0].nama)"));
  /* Tapi TIDAK melahirkan baris pembayaran: DP tanpa bukti & rekening tidak
     boleh berdiri di Dana Masuk sebagai uang yang sudah dicocokkan. */
  sama('tidak melahirkan baris pembayaran', bayar(w).length, 0);
  /* Dan layarnya MENGATAKANNYA — keadaan yang didiamkan tidak akan pernah
     dibereskan siapa pun. */
  await bukaFinance(w);
  const ket = (w.document.getElementById('efd_dpPaidKet') || {}).textContent || '';
  cek('keterangannya menyebut yang kurang', /rekening tujuan/i.test(ket), ket.slice(0, 160));
  cek('keterangannya menyebut Dana Masuk', /Dana Masuk/.test(ket), ket.slice(0, 160));
});

/* ============ 7. LENGKAP LALU DIKOSONGKAN -> ditolak keras ============ */
console.log('\n== Sudah pernah lengkap lalu dikosongkan ==');
await aman('blok dikosongkan', async () => {
  const { w } = buka();
  w.eval(`
    S.events[0].detail.dpRek='QRIS BRI';
    S.events[0].detail.dpTgl='2026-09-14';
    S.events[0].detail.dpBuktiUrl='https://x/?action=receipt&key=k1';
    S.events[0].detail.dpBuktiNama='a.jpg';
    S.events[0].detail.dpPaid={v:true};
  `);
  await bukaFinance(w);
  /* Rekening dikosongkan lagi sesudah lolos gerbang pertama. Buktinya ADA,
     jadi event ini jelas pernah lengkap — bukan event lama. */
  const r = w.document.getElementById('efd_dpRek'); if (r) r.value = '';
  w.eval("S.events[0].nama='Coba Disunting'; saveEventTab('E1')");
  await tunggu(160);
  sama('TIDAK melahirkan baris pembayaran', bayar(w).length, 0);
  const t = toastTeks(w);
  cek('ditolak dengan sebab yang disebut', /rekening tujuan/i.test(t), t);
  cek('ditawarkan jalan keluarnya', /lepas centang/i.test(t), t);
});

/* ============ 8. RESERVASI VIP: nominal & rekening wajib ============ */
console.log('\n== Reservasi VIP ==');
await aman('blok VIP', async () => {
  const { w } = buka();
  /* vipKumpulkan() membaca VIP_FORM + kotak di layar. Formnya dibuka lewat
     jalur sungguhnya supaya kotak yang dibacanya memang ada. */
  w.eval("vipForm()");
  await tunggu(150);
  const isi = (id, v) => { const el = w.document.getElementById(id); if (el) el.value = v; };
  isi('vip_nama', 'Tamu VIP'); isi('vip_tanggal', '2026-10-05');
  isi('vip_hp', '08123456789'); isi('vip_jamMulai', '19:00'); isi('vip_paxMin', '10');
  w.eval("VIP_FORM.jenis='Regular';");
  cek('form VIP terbuka', !!w.document.getElementById('vip_nama'));

  /* Tanpa satu pun bukti: lolos — DP memang belum tentu ada saat reservasinya
     dibuat, dan mewajibkannya di depan membuat orang mengarang angka. */
  sama('tanpa DP sama sekali -> lolos', w.eval('vipKumpulkan()'), '');

  /* Bukti ADA tapi nominal & rekeningnya kosong: DITOLAK. Keduanya
     menyeberang ke modul Reservasi sebagai amount & method, lalu jadi baris
     di Dana Masuk — nominal nol di sana terbaca sebagai transfer yang gagal
     dibaca, dan rekening kosong tidak bisa dicocokkan dengan mutasi mana pun. */
  w.eval("VIP_FORM.bukti=[{id:'b1',key:'k1',name:'struk.jpg',nominal:0,metode:''}];");
  const g1 = w.eval('vipKumpulkan()');
  cek('bukti tanpa nominal & rekening -> DITOLAK', !!g1, g1);
  cek('menyebut nominal', /nominal/i.test(g1), g1);
  cek('menyebut rekening tujuan', /rekening tujuan/i.test(g1), g1);
  /* BARISNYA DISEBUT. Pesan yang cuma berbunyi "ada DP yang belum lengkap"
     membuat orang memeriksa lima baris untuk menemukan satu kotak kosong. */
  cek('menyebut baris keberapa', /DP 1/.test(g1), g1);
  cek('menyebut nama berkasnya', /struk\.jpg/.test(g1), g1);

  /* Nominal diisi, rekening masih kosong: tetap ditolak, dan yang disebut
     HANYA rekeningnya. */
  w.eval("VIP_FORM.bukti[0].nominal=500000;");
  const g2 = w.eval('vipKumpulkan()');
  cek('nominal saja belum cukup', !!g2, g2);
  cek('yang sudah terisi tidak ikut dituduh', !/nominal/i.test(g2), g2);

  /* Lengkap -> lolos. Tanpa putaran ini, penjaga yang menolak APA PUN tetap
     hijau di seluruh asersi di atas. */
  w.eval("VIP_FORM.bukti[0].metode='Transfer UOB';");
  sama('lengkap -> lolos', w.eval('vipKumpulkan()'), '');

  /* Baris KEDUA yang kosong tetap tertangkap — penjaga yang berhenti di baris
     pertama meloloskan cicilan kedua yang justru paling sering terlewat. */
  w.eval("VIP_FORM.bukti.push({id:'b2',key:'k2',name:'struk2.jpg',nominal:250000,metode:''});");
  const g3 = w.eval('vipKumpulkan()');
  cek('baris kedua ikut diperiksa', /DP 2/.test(g3), g3);
});

/* ============ 9. KEDUA JALUR SIMPAN VIP lewat gerbang yang sama ========== */
console.log('\n== Gerbang VIP dipakai kedua jalur simpan ==');
cek('vipSimpanSaja memanggil vipKumpulkan',
    /function vipSimpanSaja\(\)\{[\s\S]{0,200}?vipKumpulkan\(\)/.test(tanpaKomentar));
cek('vipLanjutMeja memanggil vipKumpulkan',
    /function vipLanjutMeja\(\)\{[\s\S]{0,200}?vipKumpulkan\(\)/.test(tanpaKomentar));

console.log('\n---------------------------------------');
console.log('LULUS ' + ok + '   GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
