/* Uji ARSIP OTOMATIS di modul Konten (deploy/konten/) dan JEJAK PENYUNTING
   DENAH di modul Reservasi (deploy/reservasi/) — jsdom.

   Keduanya permintaan user 4 September 2026, dan keduanya punya jebakan yang
   sama bentuknya: sesuatu disembunyikan dari layar, dan yang disembunyikan
   harus TETAP BISA DITEMUKAN. Daftar yang menyusut tanpa keterangan terbaca
   sebagai data yang hilang, bukan sebagai data yang diarsipkan — dan yang
   membacanya akan melaporkannya sebagai bug. */
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

const KONTEN = fs.readFileSync(path.join(ROOT, 'deploy', 'konten', 'index.html'), 'utf8');
const RSV    = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const SEATS  = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Jembatan ke dalam IIFE: eval LANGSUNG di dalam lingkupnya, jadi seluruh
   variabel closure terbaca tanpa satu pun kait ditambahkan ke berkas yang
   di-deploy. Dipasang tepat sebelum `return API;` — di situ semua deklarasi
   sudah ada. */
function jembatan(html) {
  const k = 'return API;';
  if (html.split(k).length - 1 !== 1) throw new Error('jangkar IIFE Konten tidak ketemu');
  return html.replace(k, 'window.__uji = function(src){ return eval(src); };' + k);
}
function dom(html, url, siapkan) {
  return new JSDOM(
    html.replace(/<script[^>]+src="https?:\/\/[^"]*"[^>]*><\/script>/g, '')
        .replace('<script src="../assets/venue-layouts.js"></script>', '<script>' + SEATS + '</script>'),
    { url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:new VirtualConsole(),
      beforeParse(w) {
        w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
        try {
          w.localStorage.setItem('lm_session', JSON.stringify({
            expiry: Date.now() + 3600000, userId:'u1', name:'Uji Kru',
            modules:['*'], adminModules:['*'] }));
        } catch (e) {}
        w.fetch = async () => ({ ok:true, status:200,
          text: async () => JSON.stringify({ ok:true, data:{} }),
          json: async () => ({ ok:true, data:{} }) });
        if (siapkan) siapkan(w);
      } });
}

(async () => {

  /* ================= 1. Konten: arsip otomatis ================= */
  console.log('\n== Konten: yang sudah tayang / selesai otomatis diarsipkan ==');
  {
    const d = dom(jembatan(KONTEN), 'https://team.laksamanamuda.id/konten/');
    await tunggu(500);
    const w = d.window;

    /* Bawaannya harus AKTIF, bukan "semua". Inilah keluhannya: antrian yang
       menyimpan pekerjaan selesai selamanya membuat yang dikerjakan hari ini
       tenggelam. */
    cek('Content Planning bawaannya hanya yang aktif',
        w.__uji('planFilters.arsip') === 'aktif', w.__uji('planFilters.arsip'));
    ['shoot', 'design', 'edit'].forEach(k => {
      cek('antrian ' + k + ' bawaannya hanya yang belum selesai',
          w.__uji("queueState['" + k + "'].status") === 'todo',
          w.__uji("queueState['" + k + "'].status"));
    });

    /* Reset TIDAK boleh mengembalikan arsipnya. Kalau iya, menekan Reset
       justru memunculkan seluruh arsip — kebalikan dari yang diharapkan. */
    w.__uji("planFilters.arsip=''; queueState.shoot.status='';");
    w.__uji('COMS.planReset()'); await tunggu(60);
    cek('Reset planning kembali ke Aktif, bukan Semua',
        w.__uji('planFilters.arsip') === 'aktif', w.__uji('planFilters.arsip'));
    w.__uji("COMS.queueReset('shoot')"); await tunggu(60);
    cek('Reset antrian kembali ke belum-selesai, bukan Semua',
        w.__uji("queueState.shoot.status") === 'todo', w.__uji("queueState.shoot.status"));

    /* Yang dianggap arsip: sudah tayang ATAU dibatalkan. Keduanya sama-sama
       tidak menuntut pekerjaan lagi. */
    cek('Posted dianggap arsip', w.__uji("sudahArsip({status:'Posted'})") === true);
    cek('Cancelled dianggap arsip', w.__uji("sudahArsip({status:'Cancelled'})") === true);
    cek('yang masih jalan TIDAK diarsipkan',
        w.__uji("sudahArsip({status:'Editing'})") === false &&
        w.__uji("sudahArsip({status:'Approval'})") === false);

    /* Penyaringnya benar-benar menyembunyikan, dan Arsip benar-benar
       memunculkan lagi. */
    w.__uji(`DB.content = [
      {id:'c1',title:'Masih Digarap',status:'Editing',brand:'',pillar:'',pic:'',deadline:''},
      {id:'c2',title:'Sudah Tayang',status:'Posted',brand:'',pillar:'',pic:'',deadline:''},
      {id:'c3',title:'Dibatalkan',status:'Cancelled',brand:'',pillar:'',pic:'',deadline:''}
    ]`);
    const judul = () => w.__uji('filteredContent()').map(c => c.title);
    cek('bawaan menyisakan yang aktif saja',
        JSON.stringify(judul()) === '["Masih Digarap"]', JSON.stringify(judul()));
    w.__uji("planFilters.arsip='arsip'");
    cek('pilihan Arsip memunculkan yang tayang & batal',
        judul().length === 2 && judul().indexOf('Sudah Tayang') >= 0, JSON.stringify(judul()));
    w.__uji("planFilters.arsip=''");
    cek('pilihan Semua memunculkan ketiganya', judul().length === 3, JSON.stringify(judul()));

    /* JEBAKAN YANG PALING MUDAH TERJADI: dua tapis saling meniadakan. Memilih
       status "Posted" sementara tapis arsip masih "aktif" akan memulangkan
       tabel KOSONG — dan kosong terbaca sebagai "belum ada yang tayang",
       bukan sebagai "tapisnya bertabrakan". */
    w.__uji("planFilters.arsip='aktif'; planFilters.status='Posted';");
    cek('memilih status Posted tetap memunculkan isinya',
        judul().length === 1 && judul()[0] === 'Sudah Tayang', JSON.stringify(judul()));
    w.__uji("planFilters.status='';");

    /* Yang disembunyikan DISEBUT ANGKANYA. Daftar yang menyusut tanpa
       keterangan terbaca sebagai data yang hilang. */
    w.__uji("planFilters.arsip='aktif'");
    const head = w.__uji('VIEWS.planning()');
    cek('kepala halaman menyebut jumlah yang diarsipkan',
        /2<\/b> diarsipkan/.test(head), head.slice(0, 400));
    cek('dan menyediakan pilihan untuk membukanya',
        head.indexOf('Arsip (tayang/batal)') > -1);
    d.window.close();
  }

  /* ================= 2. Reservasi: jejak penyunting denah ================= */
  console.log('\n== Reservasi: siapa yang terakhir mengubah denah ==');
  {
    const d = dom(RSV, 'https://team.laksamanamuda.id/reservasi/');
    await tunggu(600);
    const w = d.window;

    cek('helper capnya ada', typeof w.leCap === 'function' && typeof w.leCapTeks === 'function');

    /* Capnya MENEMPEL DI OBJEK DENAHNYA, bukan disimpulkan dari Audit Log:
       audit dipotong di 500 baris, jadi denah yang disunting lama justru yang
       paling pasti sudah kehilangan jejaknya di sana. */
    const siapa = w.eval('SESSION ? SESSION.name : ""');
    cek('ada sesi yang bisa dicatat namanya', !!siapa, String(siapa));
    const cap = w.eval("leCap({name:'X',tables:[]})");
    cek('nama penyunting ikut tercatat', cap._editBy === siapa, cap._editBy + ' vs ' + siapa);
    cek('waktunya ikut tercatat', typeof cap._editAt === 'number' && cap._editAt > 0);

    /* Denah bawaan yang BELUM pernah disunting tidak punya penyunting.
       Menuliskan "terakhir diubah: -" membuat orang mencari orang yang tidak
       pernah ada. */
    cek('denah bawaan tidak mengarang penyunting', w.eval("leCapTeks('weekday')") === '');

    w.eval("STATE.master.layouts = STATE.master.layouts || {};");
    w.eval("STATE.master.layouts['weekday'] = leCap({name:'WD',tables:[]});");
    const teks = w.eval("leCapTeks('weekday')");
    cek('sesudah disunting, namanya disebut', teks.indexOf(siapa) > -1, teks);
    cek('berikut kapan diubahnya', /\d{2}:\d{2}/.test(teks), teks);

    /* Denah khusus tanggal ikut tercap — justru yang ini paling sering
       ditanyakan, karena ia menyimpang dari template hari itu. */
    w.eval("STATE.master.layoutTanggal = { 'tgl:2026-09-20:1': leCap({name:'Khusus',tables:[]}) };");
    cek('denah khusus tanggal juga tercap',
        w.eval("leCapTeks('tgl:2026-09-20:1')").indexOf(siapa) > -1,
        w.eval("leCapTeks('tgl:2026-09-20:1')"));

    /* Yang menyimpan HARUS memanggil capnya. Kalau tidak, seluruh helper di
       atas cuma hiasan dan tidak satu pun denah pernah punya jejak. */
    cek('leSave() mencap denah yang disimpan', /customLayouts\(\)\[key\]=leCap\(/.test(RSV));
    cek('leSimpanTanggal() mencap denah tanggal', /layoutTanggal\(\)\[k\]=leCap\(/.test(RSV));
    /* Audit tetap dicatat: yang satu menjawab "siapa yang terakhir", yang satu
       "apa saja yang pernah terjadi". Mencabut salah satunya menghilangkan
       pertanyaan yang cuma bisa dijawab olehnya. */
    cek('Audit Log tidak ikut dicabut',
        RSV.indexOf('logAudit("Simpan Layout"') > -1 &&
        RSV.indexOf('logAudit("Simpan Denah Tanggal"') > -1);
    d.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
