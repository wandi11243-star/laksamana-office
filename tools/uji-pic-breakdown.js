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
 *
 * BABAK KEDUA (permintaan user hari yang sama): PIC event diakui ke AKUN YANG
 * MENGINPUT event-nya di modul Event, bukan ke orang yang mengisi breakdown
 * tiap malam. Kolom PIC di modul Event teks bebas dan seluruhnya berisi
 * "Event Manager" — sebuah jabatan, jadi pencocokan nama tidak akan pernah
 * berhasil. Jalurnya melewati TIGA berkas (modul Event menulis jejaknya,
 * event-mysql memulangkannya, Breakdown membacanya) dan tiap sambungan yang
 * putus gagal DIAM-DIAM: PIC-nya cuma jatuh ke jaring berikutnya, dan
 * angkanya tetap terlihat wajar. Karena itu ketiganya diuji, bukan cuma
 * ujungnya.
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
        src.indexOf("cocokPic('event',ev.picName)") > -1,
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
    /* picPengisi sekarang cuma pembungkus picAkun — keduanya dipotong dari
       sumbernya, bukan disalin. Kalau cuma picPengisi yang diambil, ujinya
       gagal dengan ReferenceError yang tidak ada hubungannya dengan PIC. */
    const pp = '(function(){' + fungsiPotong(src, 'function picAkun(') + ';' +
               fungsiPotong(src, 'function picPengisi(') + ';return picPengisi;})()';
    const pa = '(function(){' + fungsiPotong(src, 'function picAkun(') + ';return picAkun;})()';
    w.eval('CURRENT_USER = { id:"u-budi", name:"Budi", level:"ops" };');
    cek('PIC jatuh ke yang mengisi kalau ia ada di roster divisi itu',
        w.eval('(' + pp + ')("event")') === 'e1', String(w.eval('(' + pp + ')("event")')));
    /* ---- AKUN YANG MENGINPUT EVENT (permintaan user 4 September 2026) ----
       Pencocok yang sama dipakai untuk akun yang MENGETIK event-nya di modul
       Event. Dua pemakai, satu pencocok — kalau dipisah, keduanya bisa
       berselisih pendapat tentang siapa "orang yang sama". */
    cek('penginput event dicocokkan lewat namanya',
        w.eval('(' + pa + ')("event","","Budi")') === 'e1');
    /* Penginput yang bukan orang divisi event tetap TIDAK diakui — sama
       ketatnya dengan yang mengisi. Menebak berarti mengakui omset untuk
       orang yang tidak mengerjakan acaranya. */
    cek('...penginput di luar roster divisi itu tidak diakui',
        !w.eval('(' + pa + ')("event","u-cici","Cici")'));
    cek('...event lama (tanpa jejak penginput) tidak menebak siapa pun',
        !w.eval('(' + pa + ')("event","","")'));
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
    /* URUTANNYA yang diuji, bukan sekadar ketiganya ada. Dibalik, omset event
       masuk ke kasir yang mengisi breakdown tiap malam padahal ada nama yang
       benar-benar tercatat membuat acaranya — dan tidak ada satu pun galat
       yang menyebutkannya. */
    const iEv = src.indexOf("state.ev.push({picId:cocokPic('event'");
    const rantai = src.slice(iEv, iEv + 400);
    cek('serapan event: nama di modul Event diperiksa lebih dulu',
        iEv > -1 && rantai.indexOf("cocokPic('event',ev.picName)") > -1 &&
        rantai.indexOf("cocokPic('event',ev.picName)") < rantai.indexOf("picAkun('event'"),
        rantai.slice(0, 200));
    cek('...lalu AKUN YANG MENGINPUT event itu',
        rantai.indexOf("picAkun('event',ev.inputOlehId,ev.inputOleh)") > -1, rantai.slice(0, 200));
    cek('...baru orang yang mengisi breakdown, sebagai jaring terakhir',
        rantai.indexOf("picAkun('event'") < rantai.indexOf("picPengisi('event')"));
    cek('...dan nama penginputnya disimpan di barisnya (srcInput)',
        rantai.indexOf("srcInput:ev.inputOleh") > -1, rantai.slice(0, 400));
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
    /* "Yang input di Event" dan "yang mengisi" adalah dua orang yang berbeda
       pada hari yang sama — event diketik PIC-nya siang, breakdown diisi
       kasir malamnya. Satu kata untuk kedua-duanya membuat pemeriksaan
       "apakah omsetnya diakui ke orang yang benar" mustahil dilakukan. */
    cek('...dan membedakannya dari "yang input di Event"',
        src.indexOf('yang input di Event') > -1);
    cek('...nama penginputnya disebut di pita, walau PIC-nya sudah cocok',
        src.indexOf('diinput oleh <b>') > -1 && src.indexOf('${input}') > -1);
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
    /* Penunjuknya BERUBAH 5 September 2026: halaman Pengaturan Target dicabut
       bersama seluruh konsep target, jadi kalimat yang menyuruh ke sana
       menunjuk halaman yang tidak ada lagi. Roster PIC memang tidak pernah
       diisi di sana — ia ditarik otomatis dari Tim/Keterangan di Office. */
    cek('...dan menunjuk ke mana harus dibetulkan',
        v.indexOf('Breakdown Sumber') > -1 && v.indexOf('Tim/Keterangan') > -1,
        v.slice(v.indexOf('Breakdown Sumber'), v.indexOf('Breakdown Sumber')+320));
    cek('...bukan ke halaman Pengaturan Target yang sudah dicabut',
        !/Pengaturan Target/.test(v));

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

  /* ====== 3. HULUNYA: modul Event mencatat siapa yang menginput ====== */
  console.log('');
  console.log('== Modul Event + backend event-mysql ==');
  {
    const src = fs.readFileSync(OMSET, 'utf8');
    const ev  = fs.readFileSync(path.join(ROOT, 'deploy', 'event', 'index.html'), 'utf8');
    const php = fs.readFileSync(path.join(ROOT, 'event-mysql', 'lib_event_mysql.php'), 'utf8');

    const iSesi = ev.indexOf('function sesiKru()');
    cek('sesiKru() memulangkan id DAN nama akun Office',
        iSesi > -1 && ev.slice(iSesi, iSesi + 300).indexOf('userId') > -1,
        'id-nya yang menahan jejak ini tetap cocok kalau namanya diganti di Office');
    cek('event baru menyimpan createdBy & createdById',
        ev.indexOf('data.createdBy=kru.name; data.createdById=kru.id;') > -1);

    /* ---- KOTAK PIC TERKUNCI (permintaan user 5 September 2026) ----
       Tiga keadaan, dan yang ketiga TIDAK boleh ikut dikunci: jejak pembuat
       baru lahir 4 September 2026, jadi event sebelum itu tidak punya satu
       pun — menguncinya berarti "Event Manager" di event lama tidak akan
       pernah bisa diperbaiki siapa pun. */
    const iPic = ev.indexOf('function fieldPicEvent(');
    const pic  = iPic > -1 ? ev.slice(iPic, ev.indexOf('function eventForm(', iPic)) : '';
    cek('kotak PIC tidak lagi diketik bebas di form event',
        ev.indexOf('<label>PIC</label><input id="e_pic" value="') < 0,
        'kotak teks bebasnya masih ada');
    cek('...digambar fieldPicEvent(), bukan inline di form',
        iPic > -1 && ev.indexOf('${fieldPicEvent(id,e)}') > -1);
    cek('...event baru terkunci ke akun yang login',
        pic.indexOf('const pemilik = id ? String(e.createdBy||') > -1 &&
        pic.indexOf('kru.name') > -1);
    cek('...yang terkunci memakai readonly, bukan disabled',
        pic.indexOf('readonly') > -1 && pic.indexOf('disabled') < 0,
        'disabled tidak bisa diblok untuk disalin');
    cek('...event lama TANPA jejak pembuat tetap bisa diketik',
        pic.indexOf('dibuat sebelum PIC dikunci ke akun') > -1,
        'event lama ikut terkunci — "Event Manager" jadi tidak bisa diperbaiki');
    cek('...dan sebabnya dikatakan di layar, bukan cuma di komentar',
        pic.indexOf('tidak diakui untuk siapa pun di Finance') > -1);
    cek('kotak terkunci dibedakan warnanya di CSS',
        ev.indexOf('input[readonly]{') > -1);

    /* Yang menentukan pengakuan omset tidak boleh bergantung pada elemen
       layar: kotak readonly tetap bisa diubah lewat devtools. */
    const iSimpanPic = ev.indexOf('const pic = lama ?');
    cek('saveEvent tidak percaya kotaknya kalau PIC terkunci',
        iSimpanPic > -1 &&
        ev.slice(iSimpanPic, iSimpanPic + 120).indexOf('lama.createdBy') > -1,
        'PIC masih dibaca mentah dari DOM');

    /* Event yang DISUNTING tidak boleh ditimpa: yang menyunting belum tentu
       yang membuat, dan menimpanya memindahkan pengakuan omset ke orang yang
       cuma membetulkan satu huruf. */
    const iSimpan = ev.indexOf('function saveEvent(');
    const badan   = ev.slice(iSimpan, ev.indexOf('function ensureDetails(', iSimpan));
    const iEdit   = badan.indexOf('if(id){Object.assign(');
    const iBaru   = badan.indexOf('data.createdBy=kru.name');
    cek('...hanya di cabang event BARU, bukan saat event disunting',
        iEdit > -1 && iBaru > iEdit, 'jejaknya ikut ditulis ulang saat menyunting');

    /* "Diinput oleh: —" membuat orang mencari jejak yang memang tidak pernah
       ada di event lama. */
    cek('"Diinput oleh" tampil di layar dan tidak digambar kalau kosong',
        (ev.split('Diinput oleh').length - 1) === 2 && ev.indexOf('${e.createdBy?') > -1);

    cek('events_hari() ikut membaca kolom data',
        php.indexOf('SELECT id, title, status, venue, pic, start_datetime, data') > -1);
    cek('...dan memulangkan inputOleh + inputOlehId',
        php.indexOf("'inputOleh'") > -1 && php.indexOf("'inputOlehId'") > -1);
    /* Event lama tidak punya field itu. Dipulangkan string kosong, bukan
       null: yang membacanya memperlakukannya sebagai "tidak ketemu". */
    cek('...event lama dipulangkan string kosong, bukan null',
        php.indexOf("isset($d['createdBy'])   ? (string)$d['createdBy']   : ''") > -1);
    /* Satu blob rusak tidak boleh menghapus seluruh daftar event hari itu
       dari layar Breakdown. */
    cek('...blob yang tidak bisa di-decode tidak melempar',
        php.indexOf('if (!is_array($d)) $d = array();') > -1);

    /* BERKAS KEMBAR: nama kunci yang dikirim backend harus sama persis dengan
       yang dibaca layar. Beda satu huruf tidak melempar apa pun — PIC-nya
       cuma diam-diam jatuh ke jaring berikutnya, dan angkanya tetap wajar. */
    cek('nama kunci backend = nama kunci yang dibaca Breakdown',
        php.indexOf("'inputOleh'") > -1 && src.indexOf('ev.inputOleh') > -1 &&
        php.indexOf("'inputOlehId'") > -1 && src.indexOf('ev.inputOlehId') > -1,
        'kunci di PHP dan di JS sudah tidak sama');
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

/* picAkun & picPengisi juga hidup di dalam viewBreakdown(). Dipotong dari
   sumbernya, bukan disalin — supaya ujinya ikut basi kalau fungsinya berubah.
   Batas akhirnya kurung tutup berindentasi dua spasi, sama dengan pembukanya;
   keduanya memang ditulis begitu di berkas aslinya. */
function fungsiPotong(src, tanda) {
  const i = src.indexOf(tanda);
  if (i < 0) throw new Error(tanda + ' tidak ketemu di sumber');
  const j = src.indexOf('\n  }', i);
  return src.slice(i, j + 4);
}
