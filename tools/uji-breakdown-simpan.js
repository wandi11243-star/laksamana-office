/* UJI: Breakdown Sumber — acara lintas hari & simpan yang benar-benar sampai
 *
 *   node tools/uji-breakdown-simpan.js
 *
 * Dua keluhan user 5 September 2026, dua-duanya gagal TANPA satu pun galat:
 *
 *   1. "karena ada 2 hari yang diinput di hari itu, maka omset yang
 *      ditampilkan di tanggal selesainya juga". events_hari() mencocokkan
 *      e.tanggal = :tgl persis, jadi acara 7-8 Agustus cuma punya baris pada
 *      tanggal 7. Omset hari kedua tidak punya barisnya sendiri.
 *
 *   2. "beberapa kali ketika simpan data selalu berhasil tapi nyatanya
 *      datanya tak tersimpan". save() itu fire-and-forget: menulis ke
 *      localStorage, memasang "Menyimpan...", lalu menjadwalkan kiriman satu
 *      detik kemudian. Tombolnya tidak pernah menunggu jawaban server, dan
 *      halamannya langsung digambar ulang seolah selesai. Kalau tabnya
 *      ditutup atau requestnya gagal, muat berikutnya mengambil salinan
 *      SERVER dan salinan lokal yang lebih baru tertimpa diam-diam.
 *
 * Keduanya menyentuh uang: yang pertama membuat omset satu hari hilang dari
 * pengakuan, yang kedua membuat sehari penuh pembukuan lenyap.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OMSET = path.join(ROOT, 'deploy', 'finance', 'omset', 'index.html');
const MKT_PHP = path.join(ROOT, 'marketing-mysql', 'lib_marketing_mysql.php');
const MKT = path.join(ROOT, 'deploy', 'marketing', 'index.html');

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
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '\n         -> ' + ket : '')); }
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
const tunggu = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== UJI BREAKDOWN: LINTAS HARI & SIMPAN ===\n');

  const src = fs.readFileSync(OMSET, 'utf8');
  const php = fs.readFileSync(MKT_PHP, 'utf8');

  /* ============ 1. Acara lintas hari ============ */
  console.log('== Acara lintas hari (marketing-mysql + omset) ==');
  {
    /* Sumber tanggal selesainya SATU: saklar "Berlangsung lebih dari satu
       hari" di modul Marketing menulis tanggalSelesai. Kalau nama fieldnya
       berubah di sana, backend membaca kunci yang tidak ada lagi dan acara
       lintas hari diam-diam kembali cuma muncul sehari. */
    const mkt = fs.readFileSync(MKT, 'utf8');
    cek('modul Marketing memang menulis tanggalSelesai',
        mkt.indexOf('ev.tanggalSelesai=ev.detail.tanggalSelesai') > -1);
    cek('...dan backend membaca kunci yang sama',
        php.indexOf("$d['tanggalSelesai']") > -1,
        'nama kunci PHP dan JS sudah tidak sama — gagal tanpa galat');

    /* Tidak bisa disaring di SQL (tanggalSelesai tinggal di blob data), jadi
       jendelanya diambil di SQL lalu disaring di PHP. Jendelanya WAJIB
       terjepit: tanpa batas bawah, query ini berubah jadi pemindaian seluruh
       tabel events tiap kali halaman Breakdown dibuka. */
    cek('query mengambil jendela ke belakang, bukan tanggal persis',
        php.indexOf('e.tanggal <= :tgl AND e.tanggal >= :batas') > -1,
        'masih e.tanggal = :tgl — acara lintas hari cuma muncul di hari pertama');
    cek('...jendelanya dijepit, tidak terbuka tanpa batas',
        php.indexOf("-60 days") > -1);
    /* Syarat kedua yang menahan seluruh acara 60 hari terakhir ikut tertarik. */
    cek('...dan yang bukan hari ini hanya lolos kalau masih berlangsung',
        php.indexOf("if ($mulai !== $tgl && !($selesai !== '' && $selesai >= $tgl)) continue;") > -1,
        'seluruh acara dalam jendela ikut tertarik');

    cek('backend memulangkan hari ke berapa & berapa hari seluruhnya',
        php.indexOf("'hari'") > -1 && php.indexOf("'totalHari'") > -1);
    /* BERKAS KEMBAR: nama kunci di PHP harus sama persis dengan yang dibaca
       JS. Beda satu huruf tidak melempar — barisnya cuma diam-diam kembali
       dianggap acara sehari, dan tombol salinnya muncul lagi. */
    cek('...dan Breakdown membaca kunci yang sama',
        src.indexOf('ev.hari') > -1 && src.indexOf('ev.totalHari') > -1,
        'kunci di PHP dan di JS sudah tidak sama');
    cek('barisnya menyimpan srcHari & srcHariTotal',
        src.indexOf('srcHari:+ev.hari||1') > -1 &&
        src.indexOf('srcHariTotal:+ev.totalHari||1') > -1);

    const w = boot(OMSET, 'https://team.laksamanamuda.id/finance/omset/');
    await tunggu(700);
    /* INTI: nilai yang dipulangkan modul Marketing adalah nilai SELURUH acara
       — satu angka untuk seluruh harinya. Tombol "salin ke kolom" pada dua
       tanggal berarti omset acara itu terhitung dua kali, dengan angka yang
       kelihatan wajar di kedua harinya. */
    /* pitaBaris membaca DB.employees untuk mencari nama PIC terpilih; boot
       di sini sengaja tidak menyelesaikan apiGet, jadi DB masih null. */
    w.eval('DB = { employees:{ marketing:[], event:[], kasir:[] } };');
    const pita = w.eval('(' + fungsiPita(src) + ')');
    const sehari = pita({ srcId: 'mkt:1', srcPic: 'Aurel', srcNominal: 5775000,
                          srcHari: 1, srcHariTotal: 1 }, 0, 'mk');
    const lintas = pita({ srcId: 'mkt:2', srcPic: 'Aurel', srcNominal: 5775000,
                          srcHari: 2, srcHariTotal: 2 }, 0, 'mk');
    cek('acara sehari TETAP punya tombol salin', sehari.indexOf('salin ke kolom') > -1,
        sehari.slice(0, 200));
    cek('acara lintas hari TIDAK punya tombol salin',
        lintas.indexOf('salin ke kolom') < 0,
        'nilainya bisa disalin di kedua hari — omsetnya terhitung dua kali');
    /* Tombol yang hilang tanpa keterangan terbaca sebagai halaman rusak. */
    cek('...dan sebabnya dikatakan di tempat tombolnya berdiri',
        lintas.indexOf('terhitung') > -1 && lintas.indexOf('SELURUH') > -1,
        lintas.slice(0, 300));
    cek('...barisnya menyebut hari keberapa', lintas.indexOf('hari ke-2 dari 2') > -1,
        lintas.slice(0, 300));
    cek('...dan acara sehari tidak diberi keterangan itu',
        sehari.indexOf('hari ke-') < 0);
    w.close();
  }

  /* ============ 2. Simpan yang benar-benar sampai ============ */
  console.log('\n== Simpan Breakdown (deploy/finance/omset) ==');
  {
    const w = boot(OMSET, 'https://team.laksamanamuda.id/finance/omset/');
    await tunggu(700);

    cek('ada konfirmasi sebelum kiriman berangkat',
        src.indexOf('if(!confirm(ringkas)) return;') > -1,
        'tombol langsung mengirim tanpa satu pun kesempatan memeriksa');
    /* Pertanyaan tanpa isi cuma melatih orang menekan OK. */
    cek('...berikut angkanya, bukan sekadar "yakin?"',
        src.indexOf("'Total Omset Diakui : '+fmtRp(tot)") > -1 &&
        src.indexOf("'Selisih            : '") > -1);
    /* Dulu render() dipanggil seketika, jadi halaman tergambar ulang seolah
       selesai padahal kiriman belum berangkat sama sekali. */
    cek('render() hanya di cabang BERHASIL',
        src.indexOf('d.bdValid=true;save();render();') < 0 &&
        src.indexOf('kirimSekarang().then(()=>{') > -1,
        'halaman masih digambar ulang sebelum server menjawab');
    cek('tombolnya dikunci selama menunggu',
        src.indexOf("btn.disabled=true; btn.textContent='Menyimpan…';") > -1);
    /* Saat gagal, layarnya dibiarkan apa adanya: isian yang barusan diketik
       masih di sana, dan percobaan ulang otomatis masih berjalan. */
    cek('gagal simpan DIKATAKAN, bukan didiamkan',
        src.indexOf('BELUM tersimpan di server') > -1);
    cek('...dan tombolnya bisa ditekan lagi',
        src.indexOf("btn.disabled=false; btn.textContent='Simpan Breakdown';") > -1);
    /* Penutupan tab tidak boleh membuang kiriman yang belum berangkat. */
    cek('halaman menahan penutupan saat masih ada yang belum terkirim',
        src.indexOf("window.addEventListener('beforeunload'") > -1 &&
        src.indexOf('if(!DIRTY && !SAVING) return;') > -1);

    /* ---- kirimSekarang() dijalankan sungguhan ---- */
    w.eval('SAVING=false; DIRTY=false; RETRY_KE=0; DB=DB||{};');
    w.eval('window.__balas={ok:true,data:{}}; window.__kirim=0;');
    w.eval('fetch=function(){ window.__kirim++; return Promise.resolve({json:function(){ return Promise.resolve(window.__balas); }}); };');

    let sukses = false;
    await w.eval('kirimSekarang()').then(() => { sukses = true; }, () => {});
    cek('kirimSekarang selesai hanya SESUDAH server menjawab',
        sukses && w.eval('window.__kirim') === 1,
        'permintaan terkirim: ' + w.eval('window.__kirim'));
    cek('...dan tidak ada lagi yang tertinggal', w.eval('DIRTY') === false);

    /* Server yang MENOLAK harus sampai ke pemanggilnya sebagai gagal — bukan
       ditelan lalu dilaporkan berhasil, yang persis keluhan aslinya. */
    w.eval("window.__balas={ok:false,error:'Access denied for user'};");
    let pesan = '';
    await w.eval('kirimSekarang()').then(() => {}, e => { pesan = String(e && e.message || ''); });
    cek('server yang menolak dilaporkan GAGAL, bukan berhasil', pesan.length > 0, pesan);
    cek('...berikut sebab aslinya dari server',
        pesan.indexOf('Access denied') > -1, pesan);
    /* Tanpa ini, penjaga beforeunload melepaskan halaman yang justru baru
       saja gagal menyimpan. */
    cek('...dan datanya tetap ditandai belum terkirim', w.eval('DIRTY') === true);
    w.close();
  }

  console.log('\n---------------------------------------');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  process.exit(gagal ? 1 : 0);
})();

/* pitaBaris() hidup di dalam viewBreakdown(), jadi tidak bisa dipanggil dari
   luar. Dipotong dari sumbernya saat uji jalan — bukan disalin, supaya ujinya
   ikut basi kalau fungsinya berubah. Batasnya kurung tutup berindentasi dua
   spasi, sama dengan pembukanya. */
function fungsiPita(src) {
  const i = src.indexOf('function pitaBaris(');
  if (i < 0) throw new Error('pitaBaris tidak ketemu di sumber');
  const j = src.indexOf('\n  }', i);
  return src.slice(i, j + 4);
}
