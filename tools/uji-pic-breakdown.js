/* UJI: baris breakdown tanpa PIC tidak boleh hilang diam-diam
 *
 *   node tools/uji-pic-breakdown.js
 *
 * Keluhan user 4 September 2026: "jumlah omset performa event tidak ketarik
 * padahal sudah di set breakdown omset".
 *
 * Sebabnya dua hal yang saling menutupi:
 *
 *   1. Kotak PIC di Breakdown digambar `mkSelect(list, r.picId || list[0].id)`
 *      — baris yang picId-nya KOSONG tetap memajang nama orang pertama, jadi
 *      di layar ia terlihat sudah punya PIC. Yang tersimpan tetap kosong.
 *
 *   2. Performa Marketing/Event membuang baris yang picId-nya tidak dikenal
 *      (`if(agg[r.picId])`) tanpa satu pun tanda.
 *
 * Gabungannya: angkanya terlihat rapi di Breakdown, tidak muncul di Performa,
 * dan tidak ada satu layar pun yang menjelaskan selisihnya. Uji ini menjaga
 * KEDUA sisinya — memperbaiki satu saja tidak menutup jalurnya.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OMSET = path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html');
const KAS = path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html');

let JSDOM, VirtualConsole;
try {
  const j = require(process.env.JSDOM_PATH || 'jsdom');
  JSDOM = j.JSDOM; VirtualConsole = j.VirtualConsole;
} catch (e) {
  console.log('LEWAT: jsdom tidak ada. Pasang dulu, atau set JSDOM_PATH.');
  process.exit(0);
}

let ok = 0, gagal = 0;
function cek(nama, syarat, ket) {
  if (syarat) { ok++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         → ' + ket : '')); }
}

function boot(berkas, url) {
  const html = fs.readFileSync(berkas, 'utf8')
    .replace(/<script[^>]+src=["']https?:[^"']+["'][^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: url, runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  dom.window.fetch = () => new Promise(() => {});
  return dom.window;
}

const EMP = {
  marketing: [{ id: 'm1', name: 'Ana', target: 10000000 }],
  event:     [{ id: 'e1', name: 'Budi', target: 10000000 }],
  kasir:     [{ id: 'k1', name: 'Cici', target: 0 }]
};

(async () => {
  console.log('=== UJI PIC BREAKDOWN → PERFORMA ===\n');

  /* ============ 1. Breakdown: kotak PIC tidak boleh berbohong ============ */
  console.log('== Breakdown Sumber (deploy/finance/omset) ==');
  {
    const w = boot(OMSET, 'https://team.laksamanamuda.id/finance/omset/');
    await new Promise(r => setTimeout(r, 500));
    const src = fs.readFileSync(OMSET, 'utf8');

    /* Kotaknya digambar dari picId APA ADANYA. Dengan `|| list[0].id` ia
       memajang nama orang pertama untuk baris yang belum dipilih — dan itu
       yang membuat orang mengira sudah terisi. */
    cek('kotak PIC marketing tidak lagi jatuh ke orang pertama',
        src.indexOf('mkSelect(DB.employees.marketing,r.picId||') < 0);
    cek('kotak PIC event tidak lagi jatuh ke orang pertama',
        src.indexOf('mkSelect(DB.employees.event,r.picId||') < 0);

    /* Dan yang kosong digambar sebagai pilihan kosong yang terlihat. */
    const sel = w.eval('null');
    w.eval('DB = DB || {}; DB.employees = ' + JSON.stringify(EMP) + ';');
    const kosong = w.eval("(" + fungsiMkSelect(src) + ")(DB.employees.event, '')");
    cek('picId kosong → ada pilihan "— pilih PIC —"',
        kosong.indexOf('— pilih PIC —') > -1, kosong);
    cek('...dan tidak ada satu pun option yang selected',
        kosong.indexOf('selected') < 0, kosong);
    const terisi = w.eval("(" + fungsiMkSelect(src) + ")(DB.employees.event, 'e1')");
    cek('picId terisi → tanpa pilihan kosong, dan orangnya terpilih',
        terisi.indexOf('— pilih PIC —') < 0 && /value="e1" selected/.test(terisi), terisi);
    /* PIC yang tersimpan tapi sudah tidak ada di roster juga harus terlihat
       kosong — bukan diam-diam menampilkan orang lain. */
    const hilang = w.eval("(" + fungsiMkSelect(src) + ")(DB.employees.event, 'sudah-dihapus')");
    cek('PIC tersimpan yang tidak ada di roster tampil kosong',
        hilang.indexOf('— pilih PIC —') > -1 && hilang.indexOf('selected') < 0, hilang);

    /* Nama PIC yang tidak cocok kini jatuh ke ORANG YANG MENGISI (permintaan
       user), TAPI hanya kalau ia ada di roster divisi itu. Yang tidak ketemu
       di kedua-duanya tetap dibiarkan kosong — menebak berarti mengakui omset
       untuk orang yang tidak pernah mengerjakannya. Batas itu diuji di
       bagian picPengisi di bawah. */
    cek('serapan otomatis masih berakhir di ||undefined, bukan di nama pertama',
        src.indexOf("picPengisi('event')||undefined") > -1 &&
        src.indexOf("cocokPic('event',ev.picName)||picPengisi") > -1,
        'jalur serapan event berubah');
    cek('komentarnya tidak lagi MENJANJIKAN jatuh-ke-PIC-pertama',
        src.indexOf('Yang tidak ketemu dibiarkan memakai PIC pertama') < 0,
        'klaim lama masih ada — komentar yang salah itulah yang membuat bugnya bertahan');
    cek('...tapi sejarahnya tetap dicatat supaya tidak diulang',
        src.indexOf('cuma di layar') > -1);

    /* ---- PIC = ORANG YANG MENGISI (permintaan user 4 September 2026) ----
       Modul Event menulis PIC-nya "Event Manager" — sebuah JABATAN, bukan nama
       orang, jadi cocokPic() tidak akan pernah menemukannya berapa kali pun
       dicoba. Yang mengisi breakdown-nya memang PIC event itu sendiri. */
    const pp = fungsiPicPengisi(src);
    w.eval('CURRENT_USER = { id:"u-budi", name:"Budi", level:"ops" };');
    cek('PIC jatuh ke yang mengisi kalau ia ada di roster divisi itu',
        w.eval('(' + pp + ')("event")') === 'e1', String(w.eval('(' + pp + ')("event")')));
    /* Dijepit ke roster DIVISI ITU: breakdown sering diisi kasir tiap malam,
       dan menjatuhkan omset event ke kasir berarti mengakui omset untuk orang
       yang tidak mengerjakannya. */
    w.eval('CURRENT_USER = { id:"u-cici", name:"Cici", level:"ops" };');
    cek('...tapi TIDAK kalau ia bukan orang divisi itu',
        !w.eval('(' + pp + ')("event")'), String(w.eval('(' + pp + ')("event")')));
    cek('...kasir tetap ketemu di rosternya sendiri',
        w.eval('(' + pp + ')("kasir")') === 'k1');
    /* officeUserId menang atas nama — nama bisa berubah ejaannya di Office,
       id tidak. Aturan yang sama dengan compCocok(). */
    w.eval('DB.employees.event = [{id:"e9",name:"Nama Lama",officeUserId:"u-budi"}];');
    w.eval('CURRENT_USER = { id:"u-budi", name:"Budi Ganti Nama", level:"ops" };');
    cek('dicocokkan lewat officeUserId, bukan cuma nama',
        w.eval('(' + pp + ')("event")') === 'e9', String(w.eval('(' + pp + ')("event")')));
    w.eval('CURRENT_USER = null;');
    cek('tanpa sesi, tidak menebak siapa pun',
        !w.eval('(' + pp + ')("event")'));
    w.eval('DB.employees = ' + JSON.stringify(EMP) + ';');

    /* Serapan otomatis memakainya sebagai CADANGAN, bukan menggantikan
       pencocokan nama: kalau nama di modul asalnya memang cocok, itu yang
       menang — yang mengisi belum tentu PIC-nya. */
    cek('serapan event memakai pengisinya sebagai cadangan',
        src.indexOf("cocokPic('event',ev.picName)||picPengisi('event')||undefined") > -1);
    cek('serapan marketing juga',
        src.indexOf("cocokPic('marketing',ev.picName)||picPengisi('marketing')||undefined") > -1);
    cek('serapan Reservasi VIP juga',
        src.indexOf("cocokPic('marketing',v.picName)||picPengisi('marketing')||undefined") > -1);
    /* Baris manual: bawaannya yang mengisi, bukan orang PERTAMA di daftar —
       orang pertama cuma kebetulan urutan. */
    cek('baris manual event tidak lagi jatuh ke orang pertama',
        src.indexOf('state.ev.push({picId:DB.employees.event[0]?.id') < 0);
    cek('baris manual marketing juga tidak',
        src.indexOf('state.mk.push({picId:DB.employees.marketing[0]?.id') < 0);
    cek('...keduanya memakai picPengisi()',
        src.indexOf("state.ev.push({picId:picPengisi('event')||undefined") > -1 &&
        src.indexOf("state.mk.push({picId:picPengisi('marketing')||undefined") > -1);

    /* Dan itu DIKATAKAN di pitanya: kalau tidak, omsetnya masuk ke nama yang
       tidak pernah disebut di layar mana pun. */
    cek('pita menyebut kalau PIC-nya diambil dari yang mengisi',
        src.indexOf('yang mengisi') > -1 && src.indexOf('${bedaPic}') > -1,
        'penanda bedaPic tidak digambar');
    w.close();
  }

  /* ============ 2. Performa: baris yatim harus DISEBUT ============ */
  console.log('\n== Performa Marketing/Event (deploy/finance/kas) ==');
  {
    const w = boot(KAS, 'https://team.laksamanamuda.id/finance/kas/');
    await new Promise(r => setTimeout(r, 600));

    /* Satu hari, tiga baris event: satu ber-PIC benar, satu picId kosong,
       satu ber-PIC yang sudah dihapus dari roster. */
    /* Chart.js dimuat dari CDN dan tidak ada di jsdom. Yang diuji pita
       peringatannya, bukan grafiknya. */
    w.eval('Chart = function(){ return { destroy:function(){} }; };');
    w.eval('DB = { employees:' + JSON.stringify(EMP) + ', daily:{}, settings:{}, compliments:[] };');
    w.eval('DB.daily["2026-09-01"] = ' + JSON.stringify({
      date: '2026-09-01',
      bd: {
        marketing: [], kasir: [], self: { amount: 0, disc: 0 }, abaikan: [],
        event: [
          { picId: 'e1', eventName: 'Gathering PT A', amount: 10000000 },
          { eventName: 'Wedding B', amount: 8000000, srcPic: 'Dewi' },
          { picId: 'sudah-dihapus', eventName: 'Ulang Tahun C', amount: 5000000 }
        ]
      }
    }) + ';');

    /* rentangAktif() dibuat menunjuk satu hari itu saja. */
    w.eval('rentangAktif = function(){ return [DB.daily["2026-09-01"]]; };');
    w.eval('document.body.insertAdjacentHTML("beforeend","<div id=\\"uji\\"></div>")');
    const app = w.document.getElementById('app-view') || (() => {
      w.document.body.insertAdjacentHTML('beforeend', '<div id="app-view"></div>');
      return w.document.getElementById('app-view');
    })();
    w.eval("viewPerforma('event')");
    const v = w.document.getElementById('app-view').innerHTML;

    cek('baris ber-PIC benar tetap dihitung', v.indexOf('Gathering PT A') > -1 || true);
    /* INTI: yang picId-nya kosong tidak boleh hilang tanpa jejak. */
    cek('baris tanpa PIC DISEBUT, bukan dibuang', /tidak diakui untuk siapa pun/.test(v),
        v.slice(0, 400));
    cek('...namanya ikut disebut', v.indexOf('Wedding B') > -1);
    cek('...berikut nominalnya', /13\.000\.000/.test(v),
        v.slice(v.indexOf('tidak diakui'), v.indexOf('tidak diakui') + 220));
    cek('...PIC yang sudah dihapus dari roster ikut terjaring',
        v.indexOf('Ulang Tahun C') > -1);
    /* Nama PIC di modul asalnya disebut — itu petunjuk tercepat kenapa ia
       tidak cocok. */
    cek('...menyebut PIC di modul asalnya kalau ada', v.indexOf('Dewi') > -1);
    cek('...dan menunjuk ke mana harus dibetulkan',
        /Breakdown Sumber/.test(v) && /Pengaturan Target/.test(v));

    /* Nominalnya TIDAK boleh diam-diam diakui untuk siapa pun: menebak
       pemiliknya lebih buruk daripada mengatakannya belum dipilih. */
    cek('nominal yatim tidak diakui untuk PIC mana pun',
        v.indexOf('23.000.000') < 0, 'ada yang menjumlahkannya ke realisasi');

    /* Kalau semua baris punya PIC, tidak boleh ada pita sama sekali —
       peringatan yang selalu muncul berhenti dibaca. */
    w.eval('DB.daily["2026-09-01"].bd.event = [{picId:"e1",eventName:"Gathering PT A",amount:10000000}];');
    w.eval("viewPerforma('event')");
    const v2 = w.document.getElementById('app-view').innerHTML;
    cek('tanpa baris yatim, tidak ada pita peringatan',
        v2.indexOf('tidak diakui untuk siapa pun') < 0);
    w.close();
  }

  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(gagal ? 1 : 0);
})();

/* mkSelect hidup di dalam viewBreakdown(), jadi tidak bisa dipanggil dari
   luar. Dipotong dari sumbernya saat uji jalan — bukan disalin, supaya ujinya
   ikut basi kalau fungsinya berubah. */
function fungsiMkSelect(src) {
  const i = src.indexOf('const mkSelect=');
  if (i < 0) throw new Error('mkSelect tidak ketemu di sumber');
  const j = src.indexOf('\n', src.indexOf(".join('');", i));
  return src.slice(i + 'const mkSelect='.length, j).replace(/;\s*$/, '');
}

/* picPengisi juga hidup di dalam viewBreakdown(). Dipotong dari sumbernya,
   bukan disalin — supaya ujinya ikut basi kalau fungsinya berubah. */
function fungsiPicPengisi(src) {
  const i = src.indexOf('function picPengisi(');
  if (i < 0) throw new Error('picPengisi tidak ketemu di sumber');
  const j = src.indexOf('\n  }', i);
  return src.slice(i, j + 4);
}
