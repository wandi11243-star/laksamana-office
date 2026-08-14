#!/usr/bin/env node
/* Pemeriksa berkas Excel yang dihasilkan di peramban.
   ---------------------------------------------------------------------------
   DUA modul menulis .xlsx sendiri, byte demi byte, tanpa pustaka apa pun:

       deploy/jadwal/index.html   exportExcel('minggu'|'bulan')
       deploy/dw/index.html       exportExcelDW()

   Yang membuat berkas seperti ini berbahaya bukan kesalahan hitung, melainkan
   bentuk paket yang tidak sah. Excel TIDAK memberi tahu bagian mana yang
   salah — ia menolak seluruh berkas dengan "We found a problem with some
   content", dan seluruh isinya hilang sekaligus. Yang mengekspor tidak
   melihat apa pun yang janggal di layar; ketahuannya baru saat berkas itu
   dibuka orang lain, biasanya malam acara.

   Sudah kejadian: legenda shift dijepit dengan Math.min ke baris terakhir,
   jadi pada lembar pendek (ekspor MINGGUAN divisi berisi tiga orang) dua
   entri jatuh ke baris yang sama dan menulis dua <c r="L9"> dalam satu <row>.
   Delapan shift bawaan cuma butuh sembilan baris untuk memicunya.

   Yang diperiksa di sini justru hal-hal yang tidak pernah kelihatan dari
   layar: paket ZIP-nya bisa dibongkar, keenam part-nya ada, tiap XML-nya
   terurai, tidak ada referensi sel yang berulang, nomor baris menaik,
   mergeCell tidak menunjuk baris yang tidak ada, dan tiap s=/fontId=/fillId=
   menunjuk gaya yang benar-benar didefinisikan.

   Pemakaian:
       node tools/uji-xlsx.js            # kedua modul
       node tools/uji-xlsx.js jadwal     # satu saja

   Keluar dengan kode 1 kalau ada berkas yang tidak sah.
   =========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

/* Modul dibuka seperti di smoke-modul.js: offline, tanpa jaringan sama sekali.
   Blob & URL.createObjectURL dicegat supaya byte-nya bisa ditangkap tanpa
   pernah benar-benar mengunduh apa pun. */
function bukaModul(modul, tangkap) {
  const html = fs.readFileSync(path.join(ROOT, 'deploy', modul, 'index.html'), 'utf8');
  return new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/office/' + modul + '/',
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error('offline (uji-xlsx)'));
      w.scrollTo = () => {}; w.print = () => {}; w.alert = () => {};
      w.Blob = function (parts) { tangkap.data = parts[0]; };
      w.URL.createObjectURL = () => 'blob:uji';
      w.URL.revokeObjectURL = () => {};
      // jsdom lama belum punya TextEncoder di window; penulis ZIP memakainya.
      w.TextEncoder = w.TextEncoder || TextEncoder;
      /* Klik pada <a download> membuat jsdom meneriakkan "Not implemented:
         navigation to another Document" ke stderr — bising yang tidak berarti
         apa-apa di sini, karena byte-nya sudah ditangkap sebelum kliknya. */
      w.HTMLAnchorElement.prototype.click = function () {};
    }
  });
}

/* Bongkar ZIP metode 0 (simpan) — cukup baca local file header berurutan.
   Kedua modul memang hanya memakai metode 0, jadi tidak perlu inflate. */
function bongkarZip(buf) {
  const berkas = {};
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const pjgNama = buf.readUInt16LE(p + 26), pjgExtra = buf.readUInt16LE(p + 28);
    const ukuran = buf.readUInt32LE(p + 18);
    const nama = buf.slice(p + 30, p + 30 + pjgNama).toString('utf8');
    const mulai = p + 30 + pjgNama + pjgExtra;
    berkas[nama] = buf.slice(mulai, mulai + ukuran).toString('utf8');
    p = mulai + ukuran;
  }
  return berkas;
}

const PART_WAJIB = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
                    'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
                    'xl/worksheets/sheet1.xml'];

function periksaPaket(w, buf) {
  const salah = [];
  const berkas = bongkarZip(buf);
  PART_WAJIB.forEach(n => { if (!berkas[n]) salah.push('part hilang: ' + n); });
  if (salah.length) return { salah, ringkas: '' };

  Object.keys(berkas).forEach(n => {
    const doc = new w.DOMParser().parseFromString(berkas[n], 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) salah.push('XML tidak sah: ' + n);
  });

  const sheet = berkas['xl/worksheets/sheet1.xml'];
  const styles = berkas['xl/styles.xml'];

  /* Referensi sel yang berulang — INILAH yang membuat Excel menolak berkasnya
     tanpa menyebut sebabnya. */
  const ada = {}, ganda = [];
  (sheet.match(/<c r="([A-Z]+\d+)"/g) || []).forEach(x => {
    const r = x.slice(6, -1);
    if (ada[r]) ganda.push(r); else ada[r] = 1;
  });
  if (ganda.length) salah.push('sel berulang: ' + [...new Set(ganda)].join(', '));

  const baris = (sheet.match(/<row r="(\d+)"/g) || []).map(x => +x.match(/\d+/)[0]);
  if (!baris.length) salah.push('sheet tanpa satu pun <row>');
  const barisSalah = baris.filter((v, i) => i && v <= baris[i - 1]);
  if (barisSalah.length) salah.push('nomor baris tidak menaik: ' + barisSalah.join(', '));

  const maksBaris = baris.length ? Math.max(...baris) : 0;
  const gabungSalah = (sheet.match(/<mergeCell ref="[A-Z]+\d+:[A-Z]+(\d+)"/g) || [])
    .filter(x => +x.match(/(\d+)"$/)[1] > maksBaris);
  if (gabungSalah.length) salah.push('mergeCell menunjuk baris yang tidak ada: ' + gabungSalah.join(', '));

  /* Indeks gaya di luar daftarnya juga ditolak Excel, dan gejalanya persis
     sama dengan sel berulang: berkasnya "rusak", tanpa keterangan. */
  const hitung = (re, def) => { const m = styles.match(re); return m ? +m[1] : def; };
  const jmlXf = hitung(/<cellXfs count="(\d+)"/, 0);
  const jmlFont = hitung(/<fonts count="(\d+)"/, 0);
  const jmlFill = hitung(/<fills count="(\d+)"/, 0);
  const maksDari = (teks, re, def) => {
    const m = teks.match(re); return m ? Math.max(...m.map(x => +x.match(/\d+/)[0])) : def;
  };
  const sMaks = maksDari(sheet, / s="(\d+)"/g, 0);
  const fontMaks = maksDari(styles, /fontId="(\d+)"/g, 0);
  const fillMaks = maksDari(styles, /fillId="(\d+)"/g, 0);
  if (sMaks >= jmlXf) salah.push('gaya sel di luar cellXfs: s=' + sMaks + ' dari ' + jmlXf);
  if (fontMaks >= jmlFont) salah.push('fontId di luar <fonts>: ' + fontMaks + ' dari ' + jmlFont);
  if (fillMaks >= jmlFill) salah.push('fillId di luar <fills>: ' + fillMaks + ' dari ' + jmlFill);

  return { salah, ringkas: baris.length + ' baris · ' + Object.keys(ada).length + ' sel · '
                            + jmlXf + ' gaya · ' + Object.keys(berkas).length + ' part' };
}

/* ---------------------------------------------------------------------------
   Data contoh sengaja MINIM, bukan lengkap: lembar terpendek yang mungkin
   adalah justru yang dulu rusak, karena legendanya lebih panjang daripada
   isinya. Nama ber-karakter XML (<, &, ") ikut diuji — satu nama tamu
   bertanda kutip sudah cukup untuk merusak sheet yang tidak meng-escape.
   --------------------------------------------------------------------------- */
const SKENARIO = {
  jadwal: (px) => {
    px('S = normalizeState(seed());');
    px('ME = {id:"u1", name:"Uji Head", admin:true};');
    /* Tiga kru: lembar mingguannya cuma 9 baris, sedangkan shift bawaannya
       delapan. Inilah bentuk yang dulu menghasilkan dua <c r="L9">. */
    px('ROSTER = [{id:"u1",name:"Andi",keterangan:"Cashier"},'
      + '{id:"u2",name:\'Budi <&"> Santoso\',keterangan:"Cashier"},'
      + '{id:"u3",name:"Cici",keterangan:"Cashier"}];');
    px('DIV = "cashier"; MINGGU_AKTIF = seninDari(hariIni()); BULAN_AKTIF = bulanDari(hariIni());');
    px('S.sel[kunci("u1",hariIni())] = {u:"u1",d:hariIni(),t:"PAGI",m:"",s:"",n:""};');
    px('S.sel[kunci("u2",addD(hariIni(),1))] = {u:"u2",d:addD(hariIni(),1),t:"OFF",m:"",s:"",n:""};');
    /* Baris daily worker ikut digambar di lembar ini — bagian yang paling
       gampang terlupa saat exportnya diubah. */
    px('DW_ROWS = [{id:"x1",dwId:"d1",nama:"Dedi DW",divisi:"cashier",posisi:"Cashier",'
      + 'tgl:hariIni(),m:"18:00",s:"02:00",hadir:""}];');
    return [['minggu', 'exportExcel("minggu")'], ['bulan', 'exportExcel("bulan")']];
  },
  dw: (px) => {
    px('S = normalizeState(seed());');
    px('ME = {id:"u1", name:"Uji HR", admin:true};');
    px('BULAN_AKTIF = bulanDari(hariIni()); DIV = "bar";');
    const org = (id, nama, posisi) => 'S.pekerja.push({id:"' + id + '",nama:' + JSON.stringify(nama)
      + ',hp:"0812000000' + id.slice(-1) + '",status:"AKTIF",divisi:"bar",posisi:"' + posisi
      + '",bayarJenis:"BANK",bayarNomor:"",bayarNama:"",bank:"",skill:"",area:"",gender:"",'
      + 'catatan:"",adaPin:false,dibuatAt:0});';
    const aju = (id, dw, geser, m, s, st) => 'S.ajuan.push({id:"' + id + '",dwId:"' + dw
      + '",tgl:addD(hariIni(),' + geser + '),m:"' + m + '",s:"' + s + '",divisi:"bar",'
      + 'posisi:"Bar Helper",catatan:"",status:"' + st + '",dibuatAt:0,dibuatOleh:"",'
      + 'putusAt:0,putusOleh:"",putusNota:""});';
    px('S.pekerja=[]; S.ajuan=[];');
    px(org('d1', 'Arif', 'Bar Helper'));
    px(org('d2', 'Budi <&"> Santoso', 'Runner'));
    px(aju('a1', 'd1', 0, '16:00', '23:00', 'DISETUJUI'));
    px(aju('a2', 'd2', 1, '18:00', '02:00', 'MENUNGGU'));    // lewat tengah malam
    px(aju('a3', 'd2', 3, '14:00', '23:00', 'DITOLAK'));
    return [['sebulan', 'exportExcelDW()']];
  }
};

async function ujiModul(modul) {
  const tangkap = {};
  const dom = bukaModul(modul, tangkap);
  const w = dom.window;
  const px = (s) => w.eval(s);
  await new Promise(r => setTimeout(r, 1500));    // beri kesempatan boot() selesai

  const kasus = SKENARIO[modul](px);
  const hasil = [];
  for (const [label, panggil] of kasus) {
    tangkap.data = null;
    try { px(panggil); }
    catch (e) { hasil.push({ label, salah: ['melempar: ' + e.message] }); continue; }
    if (!tangkap.data) { hasil.push({ label, salah: ['tidak menghasilkan berkas sama sekali'] }); continue; }
    hasil.push(Object.assign({ label }, periksaPaket(w, Buffer.from(tangkap.data))));
  }
  return hasil;
}

async function main() {
  const diminta = process.argv.slice(2);
  const daftar = diminta.length ? diminta : Object.keys(SKENARIO);
  let gagal = 0;
  for (const m of daftar) {
    if (!SKENARIO[m]) { console.log('LEWAT  ' + m + ' — modul ini tidak menulis xlsx'); continue; }
    let hasil;
    try { hasil = await ujiModul(m); }
    catch (e) { console.log('GAGAL  ' + m + ' — tidak bisa dimuat: ' + e.message); gagal++; continue; }
    hasil.forEach(h => {
      if (h.salah && h.salah.length) {
        gagal++;
        console.log('GAGAL  ' + m + ' · ' + h.label);
        h.salah.forEach(x => console.log('       · ' + x));
      } else {
        console.log('OK     ' + m + ' · ' + h.label + ' — ' + h.ringkas);
      }
    });
  }
  process.exit(gagal ? 1 : 0);
}

main();
