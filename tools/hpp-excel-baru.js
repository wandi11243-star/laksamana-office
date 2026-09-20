/* hpp-excel-baru.js — berkas HPP Prasmanan yang BARU, pengganti berkas dapur
 *
 *   curl -s "https://dev.laksamanamuda.id/stock-api-mysql/hpp.php" -o tools/hpp-master.json
 *   node tools/hpp-excel-baru.js
 *
 * Permintaan user 21 September 2026 ("buat excel baru"). Berkas HPP dapur
 * kehilangan SELURUH kolom harganya sejak sheet-sheet lain dihapus 20
 * September 2026: 487 sel #REF! di lembar Prasmanan, 138 di Hasil Prasmanan.
 * Yang selamat cuma nama bahan, takaran, satuan, dan jumlah produksinya — jadi
 * berkas itu sudah tidak bisa dipakai menghitung apa pun, dan tidak bisa pula
 * dipakai membetulkan yield yang dua kali disebut di CLAUDE.md.
 *
 * YANG DITULIS DI SINI NILAI, BUKAN RUMUS. Itu sebabnya berkas ini tidak bisa
 * rusak dengan cara yang sama: tidak ada satu sel pun yang menunjuk ke sheet
 * lain, jadi menghapus sheet mana pun tidak menjatuhkan sheet yang tersisa.
 * Harga bahannya pun ikut sebagai lembarnya sendiri, supaya berkasnya berdiri
 * sendiri — persis lembar yang dulu dihapus dan melahirkan #REF! itu.
 *
 * ANGKANYA DARI MODULNYA SENDIRI, bukan dihitung ulang di sini. Modulnya
 * dijalankan di jsdom dengan data master, lalu modal, modal per satuan, dan
 * COGS dibaca dari `modalMenu()` / `modalPorsi()` / `cogsOf()` yang sama
 * dengan yang menggambar layar. Menyalin rumusnya ke alat ini berarti berkas
 * kembar LINTAS BAHASA — bentuk yang paling sulit dicocokkan, dan yang
 * selisihnya berupa uang yang tertulis beda di dua tempat.
 *
 * ISINYA KEADAAN SESUDAH resep-prasmanan-asli.xlsx DIIMPOR, bukan keadaan
 * sekarang: takaran asli + yield dari berkas dapur. Pemulihannya dipinjam dari
 * tools/hpp-prasmanan-asli.js lewat `pulihkan()` — bukan disusun ulang di
 * sini, karena dua tempat yang memulihkan takaran akan menyimpang.
 *
 * Jadi berkas ini sekaligus PRATINJAU: angka yang tertulis di sini persis yang
 * akan tampil di layar begitu berkas impornya masuk.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { pulihkan, buatXlsx, teks, num, kunci } = require('./hpp-prasmanan-asli.js');

const KELUAR = 'HPP Prasmanan (baru)';

const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const bulat = v => Math.round(num(v));
const dua = v => Math.round(num(v) * 100) / 100;
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Modul HPP dijalankan apa adanya dengan data master. `fetch` dibalas dari
   sini, jadi alat ini tidak pernah menyentuh jaringan — master-nya sudah
   diunduh lebih dulu. */
function jalankanModul(bahan, resep, setting) {
  const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'stock', 'hpp', 'index.html'), 'utf8');
  return new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://dev.laksamanamuda.id/stock/hpp/',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({
        userId: 'alat', name: 'hpp-excel-baru', modules: ['hpp'], adminModules: ['hpp'],
        expiry: Date.now() + 3600e3 }));
      w.fetch = (url) => {
        const u = String(url);
        const body = u.indexOf('items.php') > -1
          ? { products: {} }
          : { status: 'success', bahan, resep, setting };
        const t = JSON.stringify(body);
        return Promise.resolve({ ok: true, status: 200,
          text: () => Promise.resolve(t), json: () => Promise.resolve(body) });
      };
      w.print = () => {}; w.alert = () => {}; w.confirm = () => true;
    }
  });
}

(async () => {
  const P = await pulihkan();
  const sys = P.sys;

  /* Resep yang dipulihkan MENGGANTIKAN yang di master, sisanya apa adanya.
     Seluruh resep lain (base, menu à la carte) tetap ikut: prasmanan boleh
     merujuk base, dan base yang tidak ikut membuat modalnya kurang tanpa satu
     pun galat — cuma baris "bahan hilang" yang tidak akan dibaca siapa pun. */
  const ganti = new Map(P.resepBaru.map(r => [r.id, r]));
  const semua = (sys.resep || []).map(r => ganti.get(r.id) || r);

  const dom = jalankanModul(sys.bahan || [], semua, sys.setting || {});
  await tunggu(600);
  const w = dom.window;
  if (!w.modalMenu) { console.error('Modul HPP tidak jalan di jsdom — tidak ada modalMenu().'); process.exit(3); }

  const PRAS = w.eval("S.resep.filter(r=>/^PRASMANAN/i.test(String(r.seksi||'')))");
  if (!PRAS.length) { console.error('Tidak ada resep berseksi PRASMANAN.'); process.exit(3); }
  /* Diurut per seksi lalu nama — berkas dapurnya juga dikelompokkan begitu
     (Karbohidrat, Protein Berat, …), dan yang membukanya mencari menunya di
     kelompoknya. */
  PRAS.sort((a, b) => (teks(a.seksi).localeCompare(teks(b.seksi)) || teks(a.nama).localeCompare(teks(b.nama))));

  const spare = num(w.eval('SET.buffer'));
  const bahanDipakai = new Map();
  const takKenal = [];

  /* ================= lembar 1: Hasil Prasmanan ================= */
  const L1 = [['NO', 'KATEGORI', 'NAMA MENU', 'JUMLAH PROD.', 'SATUAN',
               'MODAL BAHAN', 'SPARE ' + Math.round(spare * 1000) / 10 + '%', 'MODAL TOTAL',
               'MODAL / SATUAN', 'HARGA JUAL', 'COGS %', 'CATATAN']];
  /* ================= lembar 2: Prasmanan (rincian) ================= */
  const L2 = [['NAMA MENU', 'HASIL', 'NAMA BAHAN', 'JUMLAH', 'SATUAN', 'HARGA SATUAN', 'HARGA TOTAL']];

  PRAS.forEach((r, i) => {
    const m = w.modalMenu(r), perSat = w.modalPorsi(r), c = w.cogsOf(r);
    const yq = num(r.yield_qty) || 1, yu = teks(r.yield_unit) || 'Porsi';
    const bukanPorsi = !/^(porsi|pcs|pax)$/i.test(yu) && num(r.harga_baru) > 0;

    /* CATATANNYA MENYEBUT YANG PERLU DIKERJAKAN, bukan cuma keadaan. Kolom
       COGS yang berbunyi 2005% tanpa keterangan dibaca sebagai salah hitung;
       yang salah satuan yield-nya, dan itu cuma bisa dibetulkan orang. */
    let cat = '';
    if (bukanPorsi) cat = 'Satuan hasilnya bukan porsi, sementara harga jualnya per porsi — COGS% di baris ini TIDAK BISA DIBACA. Isi jumlah porsinya.';
    else if (m.hilang && m.hilang.length) cat = m.hilang.length + ' bahan belum ada di daftar Bahan, jadi modalnya masih kurang: ' + [...new Set(m.hilang)].join(', ');
    else if (!num(r.harga_baru)) cat = 'Belum ada harga jual.';

    L1.push([i + 1, teks(r.seksi).replace(/^PRASMANAN\s*-\s*/i, ''), r.nama,
             yq, yu,
             bulat(m.bahan), bulat(m.spare), bulat(m.total),
             dua(perSat), bulat(r.harga_baru),
             c === null ? '' : Math.round(c * 1000) / 10, cat]);

    const isiBahan = (r.bahan || []).filter(b => b && b.nama);
    if (!isiBahan.length) {
      L2.push([r.nama, yq + ' ' + yu, '(tidak ada rincian bahan — modal diketik manual)',
               '', '', '', bulat(m.total)]);
    }
    isiBahan.forEach((b, j) => {
      const s = w.hitungBaris(b, r.jenis);
      const q = num(b.qty);
      /* HARGA SATUANNYA DITURUNKAN dari subtotal ÷ qty, bukan dibaca langsung
         dari daftar bahan. Modul mengkonversi Kg<->Gr dan L<->Ml sendiri, jadi
         harga daftar (per Kg) tidak sebanding dengan takaran resep (per Gr) —
         yang ditulis di sini harus harga untuk SATUAN YANG TERTULIS DI BARIS
         INI, kalau tidak kolomnya tidak bisa dikalikan dengan mata. */
      const perSatuan = (s.ada && q > 0) ? s.nilai / q : null;
      if (!s.ada) takKenal.push({ menu: r.nama, bahan: b.nama });
      if (s.ada && b.ref !== 'resep') bahanDipakai.set(kunci(b.nama), b.nama);
      L2.push([j === 0 ? r.nama : '', j === 0 ? (yq + ' ' + yu) : '',
               b.nama + (b.ref === 'resep' ? ' (resep)' : ''),
               q, teks(b.satuan),
               perSatuan === null ? 'belum ada harga' : dua(perSatuan),
               s.ada ? bulat(s.nilai) : 'belum ada harga']);
    });
    if (isiBahan.length) {
      if (m.spare > 0) {
        L2.push(['', '', 'Modal bahan', '', '', '', bulat(m.bahan)]);
        L2.push(['', '', 'Spare ' + Math.round(spare * 1000) / 10 + '%', '', '', '', bulat(m.spare)]);
      }
      L2.push(['', '', 'TOTAL MODAL', '', '', '', bulat(m.total)]);
      L2.push(['', '', 'MODAL PER ' + yu.toUpperCase(), '', '', '', dua(perSat)]);
      L2.push(['', '', '', '', '', '', '']);
    }
  });

  /* ================= lembar 3: Database Harga =================
     Inilah lembar yang dulu dihapus dan melahirkan seluruh #REF!. Ia ditulis
     sebagai NILAI, jadi kalaupun suatu hari ikut dihapus, dua lembar di atas
     tetap utuh — angkanya sudah berdiri sendiri di selnya masing-masing. */
  const L3 = [['NAMA BAHAN', 'SATUAN', 'QTY BELI', 'HARGA BELI', 'HARGA / SATUAN']];
  const PB = w.eval('Object.keys(PB).map(k=>PB[k])');
  const dipakai = [...bahanDipakai.values()].map(n => kunci(n));
  (sys.bahan || [])
    .filter(b => dipakai.indexOf(kunci(b.nama)) >= 0)
    .sort((a, b) => teks(a.nama).localeCompare(teks(b.nama)))
    .forEach(b => L3.push([b.nama, teks(b.satuan), num(b.qty_beli) || 1,
                           bulat(b.harga_beli), dua(w.per1(b))]));

  /* ================= lembar 4: Perlu Diperiksa ================= */
  const L4 = [['BAGIAN', 'MENU', 'DETAIL 1', 'DETAIL 2']];
  L4.push(['RINGKASAN', 'Menu prasmanan di berkas ini', PRAS.length, '']);
  L4.push(['RINGKASAN', 'Takarannya dikembalikan ke berkas dapur', P.dipulihkan.length, '']);
  L4.push(['RINGKASAN', 'Satuan hasilnya bukan porsi', P.satuanAneh.length, '']);
  L4.push(['RINGKASAN', 'Bahan yang belum ada di daftar Bahan', takKenal.length, '']);
  L4.push(['', '', '', '']);
  L4.push(['SATUAN HASIL BUKAN PORSI',
           'Berkas dapur menuliskan hasilnya dalam Kg/Liter sementara harga jualnya per porsi, jadi COGS%-nya tidak bisa dibaca. Isi jumlah porsinya di kolom JUMLAH PROD. lembar Hasil Prasmanan, lalu beri tahu supaya datanya ikut dibetulkan.', '', '']);
  L4.push(['', 'Menu', 'Hasil sekarang', 'Harga jual/porsi']);
  P.satuanAneh.forEach(x => L4.push(['', x.nama, x.yield, x.jual]));
  L4.push(['', '', '', '']);
  L4.push(['HASILNYA BEDA DARI PEMBAGI LAMA',
           'Angka di berkas dapur berbeda dari pembagi yang dipakai impor sebelumnya. Yang dipakai berkas ini angka BERKAS DAPUR, sesuai permintaan.', '', '']);
  L4.push(['', 'Menu', 'Pembagi lama', 'Hasil menurut berkas dapur']);
  P.dipulihkan.filter(x => x.beda).forEach(x => L4.push(['', x.nama, x.pengali, x.yield]));
  L4.push(['', '', '', '']);
  L4.push(['BAHAN BELUM DIKENAL',
           'Namanya dirujuk resep tapi tidak ada di daftar Bahan, jadi modal resepnya masih kurang dari yang sebenarnya.', '', '']);
  L4.push(['', 'Menu', 'Nama bahan', '']);
  takKenal.forEach(x => L4.push(['', x.menu, x.bahan, '']));

  dom.window.close();

  fs.writeFileSync(path.join(ROOT, KELUAR + '.xlsx'), buatXlsx([
    { nama: 'Hasil Prasmanan', aoa: L1 },
    { nama: 'Prasmanan', aoa: L2 },
    { nama: 'Database Harga', aoa: L3 },
    { nama: 'Perlu Diperiksa', aoa: L4 },
  ]));

  console.log('* ' + KELUAR + '.xlsx');
  console.log('  menu prasmanan          : ' + PRAS.length);
  console.log('  baris rincian bahan     : ' + (L2.length - 1));
  console.log('  bahan di Database Harga : ' + (L3.length - 1));
  console.log('  satuan hasil bukan porsi: ' + P.satuanAneh.length);
  console.log('  bahan belum dikenal     : ' + takKenal.length);
  console.log('');
  console.log('Angkanya = keadaan SESUDAH resep-prasmanan-asli.xlsx diimpor,');
  console.log('dan dibaca dari modul HPP-nya sendiri — bukan dihitung ulang di sini.');
})().catch(e => { console.error(e); process.exit(1); });
