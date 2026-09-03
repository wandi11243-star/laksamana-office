/* Uji "Pilih & Kunci Meja" di modul Marketing (deploy/marketing/) — jsdom.

   Halaman ini menggambar denah venue yang SAMA dengan modul Reservasi dan
   menulis kunciannya ke database Reservasi. Dua modul, satu ruangan — dan tiap
   kali keduanya menyimpang, gejalanya bukan galat melainkan kru yang berdebat
   meja mana yang benar.

   TIGA HAL YANG DIJAGA DI SINI, ketiganya permintaan user 2 September 2026:

   1. DENAHNYA IKUT YANG DISETEL DI MODUL RESERVASI. Urutan prioritasnya harus
      sama persis dengan getLayout()/dayTypeLayoutLt() di sana: denah khusus
      tanggal > template hasil edit > bawaan. Meja yang ditambah atau digeser di
      sana harus langsung terpakai di sini.
   2. KUNCI MEJA H-3 JAM, bukan sehari penuh. Tamu jam 12:00 tidak boleh
      memblokir acara jam 20:00 di hari yang sama — modul Reservasi sendiri
      mengizinkannya, dan denah Marketing yang lebih penuh daripada kenyataan
      membuat kru menolak acara yang sebenarnya masih muat.
   3. NADA WARNA & UKURAN mengikuti modul Reservasi.

   Angka H-3 jam dan warna zonanya dibaca dari KEDUA berkas lalu dibandingkan,
   bukan ditulis ulang di sini: yang disalin tangan pasti menyimpang. */
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

const DIR   = path.join(ROOT, 'deploy', 'marketing');
const HTML  = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const RSV   = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const SEATS = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function domMkt() {
  const dom = new JSDOM(
    /* venue-layouts.js DISISIPKAN apa adanya (berkas lokal, sumber tunggal
       koordinat meja); skrip CDN dibuang — tidak bisa dimuat jsdom dan tidak
       ada hubungannya dengan yang diuji. */
    HTML.replace(/<script[^>]+src="https?:\/\/[^"]*"[^>]*><\/script>/g, '')
        .replace('<script src="../assets/venue-layouts.js"></script>', '<script>' + SEATS + '</script>'),
    { url:'https://team.laksamanamuda.id/marketing/', runScripts:'dangerously',
      pretendToBeVisual:true, virtualConsole:new VirtualConsole(),
      beforeParse(w) {
        w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
        try {
          w.localStorage.setItem('lm_session', JSON.stringify({
            expiry: Date.now() + 3600000, userId:'u1', name:'Uji',
            modules:['marketing'], adminModules:['marketing'] }));
        } catch (e) {}
        w.fetch = async () => ({ ok:true, status:200,
          text: async () => JSON.stringify({ ok:true, data:{} }),
          json: async () => ({ ok:true, data:{} }) });
      } });
  return dom;
}

/* Satu meja saja sudah cukup untuk menguji prioritas denah: yang diperiksa
   denah MANA yang menang, bukan isinya. Posisinya sengaja berbeda di tiap
   sumber supaya "meja digeser" benar-benar terlihat. */
const mejaDi = x => ({ name:'Uji', tables:[{ id:'T1', x:x, y:10, w:100, h:100, cap:'4', zone:'wood' }] });
/* Posisi meja pertama sebuah denah, aman terhadap denah yang TIDAK ADA.
   Membacanya langsung (L.tables[0].x) membuat regresi "denah tidak ketemu"
   meledak sebagai TypeError alih-alih dilaporkan sebagai GAGAL bernama — dan
   uji yang meledak berhenti sebelum asersi berikutnya sempat jalan. */
const posX = L => ((L && L.tables && L.tables[0]) || {}).x;

(async () => {

  const dom = domMkt(); await tunggu(600);
  const w = dom.window;

  /* ================= 1. denah ikut modul Reservasi ================= */
  console.log('\n== Denah ikut yang disetel di modul Reservasi ==');
  {
    cek('berkas denah bersama termuat', !!w.LM_VENUE_LAYOUTS);
    /* Tanpa apa pun yang tersimpan: pakai bawaan dari assets/venue-layouts.js. */
    cek('tanpa setelan, pakai denah bawaan',
        w.vipDenah({}, 'weekday') === w.LM_VENUE_LAYOUTS.weekday);

    /* Template yang DIEDIT di modul Reservasi (master.layouts) menang atas
       bawaan — meja yang ditambah/digeser di sana ikut terbawa ke sini. */
    const edit = { master:{ layouts:{ weekday: mejaDi(500) } } };
    cek('template hasil edit menang atas bawaan',
        posX(w.vipDenah(edit, 'weekday')) === 500,
        String(posX(w.vipDenah(edit, 'weekday'))));

    /* Denah KHUSUS SATU TANGGAL menang atas segalanya — persis getLayout() di
       sana. Inilah yang dulu tidak dibaca sama sekali: meja yang digeser untuk
       satu malam tetap tergambar di posisi lamanya. */
    const d = { master:{ layouts:{ weekday: mejaDi(500) },
                         layoutTanggal:{ 'tgl:2026-09-05:1': mejaDi(900) } } };
    cek('denah khusus tanggal menang atas template',
        posX(w.vipDenah(d, 'tgl:2026-09-05:1')) === 900,
        String(posX(w.vipDenah(d, 'tgl:2026-09-05:1'))));
    cek('dan dipilih otomatis untuk tanggal itu',
        w.vipDenahKeyOtomatis(d, '2026-09-05') === 'tgl:2026-09-05:1',
        w.vipDenahKeyOtomatis(d, '2026-09-05'));
    cek('tanggal lain tidak ikut terbawa',
        w.vipDenahKeyOtomatis(d, '2026-09-07') !== 'tgl:2026-09-05:1',
        w.vipDenahKeyOtomatis(d, '2026-09-07'));
    /* Tombol lantainya menyebut denah itu — kunci mentah "tgl:2026-09-05:1"
       tidak mengatakan apa pun kepada yang menekannya. */
    cek('ikut ditawarkan sebagai pilihan denah',
        w.vipDenahKeys(d, '2026-09-05').indexOf('tgl:2026-09-05:1') >= 0,
        w.vipDenahKeys(d, '2026-09-05').join(','));
    cek('tidak ditawarkan untuk tanggal lain',
        w.vipDenahKeys(d, '2026-09-07').indexOf('tgl:2026-09-05:1') < 0);
    cek('labelnya bukan kunci mentah',
        w.vipDenahLabel(d, 'tgl:2026-09-05:1').indexOf('tgl:') < 0,
        w.vipDenahLabel(d, 'tgl:2026-09-05:1'));
    cek('lantainya terbaca dari kuncinya', w.vipDenahLantai(d, 'tgl:2026-09-05:2') === 2);

    /* Jadwal denah per tanggal (layoutOverrides) — lantai 2 punya kuncinya
       SENDIRI. Menumpangkannya di kunci lantai 1 berarti menjadwalkan denah
       bawah ikut mengganti denah atas. */
    const ov = { master:{ layoutOverrides:{ '2026-09-09':'weekend' },
                          layoutOverrides2:{ '2026-09-09':'lantai2_weekend' } } };
    cek('jadwal denah lantai 1 dipakai', w.vipDenahKeyOtomatis(ov, '2026-09-09', 1) === 'weekend');
    cek('jadwal denah lantai 2 dari kunci terpisah',
        w.vipDenahKeyOtomatis(ov, '2026-09-09', 2) === 'lantai2_weekend',
        w.vipDenahKeyOtomatis(ov, '2026-09-09', 2));

    /* MINGGU IKUT AKHIR PEKAN. Dulu di sini cuma Jumat & Sabtu sementara modul
       Reservasi sudah memasukkan Minggu — jadi tiap hari Minggu kedua modul
       menggambar denah yang berbeda untuk ruangan yang sama. */
    cek('Minggu memakai denah Weekend', w.vipDenahKeyOtomatis({}, '2026-09-06') === 'weekend',
        w.vipDenahKeyOtomatis({}, '2026-09-06'));
    cek('Jumat & Sabtu tetap Weekend',
        w.vipDenahKeyOtomatis({}, '2026-09-04') === 'weekend' &&
        w.vipDenahKeyOtomatis({}, '2026-09-05') === 'weekend');
    cek('Senin tetap Weekday', w.vipDenahKeyOtomatis({}, '2026-09-07') === 'weekday');
    /* Aturannya dibandingkan dengan modul Reservasi, bukan dihafal: kalau
       hariAkhirPekan di sana berubah, uji ini yang menyalakannya. */
    cek('aturan akhir pekan sama dengan modul Reservasi',
        /dg===0\|\|dg===5\|\|dg===6/.test(RSV.replace(/\s/g, '')),
        'hariAkhirPekan di reservasi berubah — vipAkhirPekan harus ikut');
  }

  /* ================= 2. kunci meja H-3 jam ================= */
  console.log('\n== Kunci meja H-3 jam, bukan sehari penuh ==');
  {
    const res = jam => ({ id:'r'+jam, date:'2026-09-10', time:jam, table:'T1',
                          name:'Tamu '+jam, status:'Confirmed' });
    const d = { reservations:[res('12:00')] };

    /* Tamu jam 12:00 mengunci mejanya 09:00–15:00. Acara jam 20:00 di hari
       yang sama TIDAK bentrok — dan itu memang yang diizinkan modul
       Reservasi. Sebelum ini seluruh hari diblokir. */
    cek('jam jauh: meja masih bisa dipesan',
        !w.rsvMejaTerpakai(d, '2026-09-10', '', '20:00')['T1'],
        JSON.stringify(w.rsvMejaTerpakai(d, '2026-09-10', '', '20:00')));
    /* Jam 14:00 masih di dalam jendela 09:00–15:00 → terkunci. */
    cek('jam berdekatan: terkunci',
        !!w.rsvMejaTerpakai(d, '2026-09-10', '', '14:00')['T1']);
    cek('tepat H-3 masih terkunci',
        !!w.rsvMejaTerpakai(d, '2026-09-10', '', '09:00')['T1']);
    cek('lewat H+3 sudah bebas',
        !w.rsvMejaTerpakai(d, '2026-09-10', '', '15:01')['T1']);

    /* Tanpa jam, tidak ada cara tahu jendela mana yang bentrok — yang dipakai
       seluruh hari. Menganggapnya kosong berarti menjanjikan meja yang
       mungkin sudah dipesan. */
    cek('tanpa jam: sehari penuh, bukan dianggap kosong',
        !!w.rsvMejaTerpakai(d, '2026-09-10', '', '')['T1']);

    /* Status yang MEMBEBASKAN meja tetap seperti semula. */
    const batal = { reservations:[Object.assign(res('20:00'), { status:'Cancelled' })] };
    cek('yang dibatalkan tidak mengunci', !w.rsvMejaTerpakai(batal, '2026-09-10', '', '20:00')['T1']);
    const pulang = { reservations:[Object.assign(res('20:00'), { leftAt:Date.now() })] };
    cek('yang sudah pulang tidak mengunci', !w.rsvMejaTerpakai(pulang, '2026-09-10', '', '20:00')['T1']);
    cek('kuncian sendiri tidak dihitung bentrok',
        !w.rsvMejaTerpakai({ reservations:[res('20:00')] }, '2026-09-10', 'r20:00', '20:00')['T1']);

    /* LINTAS HARI: booking 02:00 dini hari mengunci mejanya sejak 23:00 malam
       sebelumnya. Penyaring lama (r.date !== tanggal) membuat kuncian itu
       tidak terlihat sama sekali. */
    const dini = { reservations:[{ id:'x', date:'2026-09-11', time:'02:00', table:'T1',
                                   name:'Dini', status:'Confirmed' }] };
    cek('booking dini hari mengunci malam sebelumnya',
        !!w.rsvMejaTerpakai(dini, '2026-09-10', '', '23:30')['T1'],
        JSON.stringify(w.rsvMejaTerpakai(dini, '2026-09-10', '', '23:30')));

    /* Angka H-3 jamnya dibandingkan dengan modul Reservasi, bukan dihafal. */
    const lead = /const\s+LOCK_LEAD_MIN\s*=\s*(\d+)/.exec(RSV);
    const leadMkt = /const\s+VIP_LOCK_LEAD_MIN\s*=\s*(\d+)/.exec(HTML);
    cek('H-3 jam sama dengan modul Reservasi',
        lead && leadMkt && lead[1] === leadMkt[1],
        (lead && lead[1]) + ' vs ' + (leadMkt && leadMkt[1]));
  }

  /* ================= 3. nada warna & ukuran ================= */
  console.log('\n== Nada warna & ukuran mengikuti modul Reservasi ==');
  {
    /* Kelas zona benar-benar digambar — CSS-nya tidak berguna kalau markupnya
       tidak pernah menyebut zonanya. */
    const html = w.vipDenahHTML({}, {}, [], { tanggal:'2026-09-07' });
    cek('denah tergambar', html.indexOf('dn-meja') > -1);
    cek('kelas zona ikut digambar', /class="dn-meja zone-\w+/.test(html),
        html.slice(html.indexOf('dn-meja') - 30, html.indexOf('dn-meja') + 90));
    /* Zona yang tidak dikenal DIBIARKAN tanpa kelas, bukan dijatuhkan ke warna
       pertama: meja berzona baru harus terlihat berbeda supaya CSS-nya ditambah. */
    cek('zona tak dikenal tidak dipaksa berwarna', w.dnZona({ zone:'entah' }) === '');
    cek('zona dikenal diberi kelas', w.dnZona({ zone:'wood' }) === ' zone-wood');

    /* Warna zonanya disalin nilainya dari modul Reservasi. Dibandingkan, bukan
       dihafal: dua denah dengan warna zona berbeda untuk ruangan yang sama
       membuat kru menyebut area yang salah lewat telepon. */
    const warna = (teks, sel) => {
      const re = new RegExp('\\.' + sel + '\\{background:(#[0-9a-fA-F]{3,6})');
      const m = re.exec(teks.replace(/\s*\n\s*/g, ''));
      return m ? m[1].toLowerCase() : null;
    };
    ['zone-blue', 'zone-green', 'zone-wood', 'zone-vip', 'zone-dark', 'zone-diamond', 'zone-ext']
      .forEach(z => {
        const a = warna(RSV, 'seat\\.' + z), b = warna(HTML, 'dn-meja\\.' + z);
        cek('warna ' + z + ' sama dengan modul Reservasi', !!a && a === b, a + ' vs ' + b);
      });

    /* Denahnya dibesarkan (keluhan user: "terlalu kecil"). Proporsinya dikunci
       aspect-ratio yang sama dengan sana, jadi tidak pernah gepeng. */
    cek('proporsi denah sama dengan modul Reservasi', HTML.indexOf('aspect-ratio:1600/1160') > -1);
    const mw = /\.denah\{[^}]*max-width:(\d+)px/.exec(HTML.replace(/\s*\n\s*/g, ''));
    cek('denah dibesarkan (lebih dari 1180px)', mw && +mw[1] > 1180, mw && mw[1]);
    /* Huruf ikut membesar. Denah yang dibesarkan tapi hurufnya tetap 9,5px
       tidak menyelesaikan keluhannya. */
    cek('ukuran huruf meja ikut lebar denah',
        /\.dn-meja\{[^}]*font-size:clamp\(/.test(HTML.replace(/\s*\n\s*/g, '')));
    cek('font 9.5px yang lama sudah tidak ada', HTML.indexOf('.dn-meja{font-size:9.5px}') < 0);
  }

  dom.window.close();
  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
