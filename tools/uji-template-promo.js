/* Uji template Excel Promotion di BD OS (2 Oktober 2026).

   Yang dijaga bukan adanya tombol, melainkan PUTARAN PENUHNYA: template yang
   diunduh, diisi satu baris, lalu dimasukkan lagi lewat promoImportBaca() yang
   SUNGGUHAN harus melahirkan satu promo baru. Template yang kolomnya tidak
   dikenali impor tidak melempar apa pun — isinya cuma diam-diam tidak terbaca.

     node tools/uji-template-promo.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

let lulus = 0, gagal = 0;
function cek(nama, ok, info) {
  if (ok) { lulus++; console.log('  OK    ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (info ? '  — ' + info : '')); }
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Modul BD dibungkus IIFE — jembatan uji disuntikkan DI DALAM pembungkusnya,
   di salinan memori. Pola yang sama dengan uji-vendor.js. */
const ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'bd', 'index.html'), 'utf8');
const JEMBATAN = '\nwindow.__uji={get DB(){return DB;},PROMO_CSV_KOL:PROMO_CSV_KOL,' +
  'promoImportBaca:promoImportBaca,get PROMO_IMPOR(){return PROMO_IMPOR;}};\n';
const iTutup = ASLI.lastIndexOf('})();');
if (iTutup < 0) throw new Error('penutup IIFE modul BD tak ketemu');
const HTML = ASLI.slice(0, iTutup) + JEMBATAN + ASLI.slice(iTutup);

(async () => {
  const unduhan = [];
  const dom = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/bd/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId: 'u1', name: 'Uji', modules: ['bd'], adminModules: ['bd']
        }));
      } catch (e) {}
      const jawab = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj), json: async () => obj });
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const act = body.action || (String(url).match(/action=([a-zA-Z]+)/) || [])[1] || '';
        if (String(url).indexOf('account-api') > -1) return jawab({ ok: true, members: [] });
        if (!act || act === 'getAll') return jawab({ ok: true, data: {
          promos: [{ id: 'p-lama', nama: 'Promo Lama', mulai: '2026-09-01', selesai: '2026-09-30', benefit: '10%' }]
        } });
        return jawab({ ok: true, data: { saved: true } });
      };
      /* Blob dibungkus supaya isi berkas yang diunduh bisa dibaca. */
      const BlobAsli = w.Blob;
      w.Blob = function (parts, opt) { unduhan.push(parts.join('')); return new BlobAsli(parts, opt); };
      w.URL.createObjectURL = () => 'blob:uji';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { unduhan.nama = this.download; };
    }
  });
  const w = dom.window;
  for (let i = 0; i < 120 && !(w.__uji && w.__uji.DB); i++) await tunggu(50);
  const u = w.__uji;

  console.log('\n== Tombol & unduhan ==');
  cek('APP.promoTemplate tersedia', typeof w.APP.promoTemplate === 'function');
  cek('tombol Template digambar di halaman Promotion',
      ASLI.indexOf('onclick="APP.promoTemplate()"') > -1);
  w.APP.promoTemplate();
  const isi = unduhan[unduhan.length - 1] || '';
  cek('berkas terunduh bernama template_promo.csv', unduhan.nama === 'template_promo.csv', unduhan.nama);
  cek('berkas diawali BOM + sep=, (terbuka rapi di Excel Indonesia)', /^﻿sep=,\r\n/.test(isi));
  const baris = isi.replace(/^﻿sep=,\r\n/, '').split(/\r\n/).filter(Boolean);
  cek('template KOSONG: hanya baris judul, tanpa baris contoh', baris.length === 1, baris.length + ' baris');

  console.log('\n== Kolomnya = yang memang dibaca impor ==');
  const judul = (baris[0] || '').split(',').map(s => s.replace(/^"|"$/g, ''));
  const dibaca = u.PROMO_CSV_KOL.filter(k => k.b && k.b !== 'id').map(k => k.k);
  cek('kolomnya sama persis dengan kolom ber-bidang (tanpa ID)',
      JSON.stringify(judul) === JSON.stringify(dibaca), judul.join('|') + ' vs ' + dibaca.join('|'));
  cek('kolom ID tidak ikut', judul.indexOf('ID') < 0);
  cek('kolom keterangan (Tipe, Status) tidak ikut', judul.indexOf('Tipe') < 0 && judul.indexOf('Status') < 0);

  console.log('\n== Putaran penuh: isi template lalu Import ==');
  /* Template berakhir TANPA baris baru, jadi isian dimulai di baris sendiri —
     persis yang ditulis Excel waktu orang mengetik di baris kedua. */
  const terisi = isi + '\r\n' + '"Promo Merdeka","17-08-2026","31-08-2026","17,00 %"\r\n' +
                       '"Promo Lama","01-09-2026","15-10-2026","15%"\r\n';
  u.promoImportBaca(terisi, 'template_promo.csv');
  const r = u.PROMO_IMPOR;
  cek('rencana impor terbentuk', !!r);
  cek('baris baru terbaca sebagai promo baru', r && r.baru.length === 1 && r.baru[0].nama === 'Promo Merdeka',
      r && JSON.stringify(r.baru));
  cek('tanggal hari-bulan-tahun terbaca', r && r.baru[0] && r.baru[0].mulai === '2026-08-17' && r.baru[0].selesai === '2026-08-31',
      r && r.baru[0] && (r.baru[0].mulai + ' ' + r.baru[0].selesai));
  cek('benefit dirapikan', r && r.baru[0] && r.baru[0].benefit === '17%', r && r.baru[0] && r.baru[0].benefit);
  cek('nama yang sudah ada jadi pembaruan, bukan kembar', r && r.ubah.length === 1 && r.ubah[0].id === 'p-lama',
      r && JSON.stringify(r.ubah));
  cek('tidak ada baris yang dilewati', r && r.lewat.length === 0, r && JSON.stringify(r.lewat));

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
