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
/* Dibaca ulang dari disk: asersi yang membandingkan SUMBER harus melihat
   berkas yang sekarang, bukan salinan yang diambil di awal berkas ini. */
const KONTEN_BARU = () => fs.readFileSync(path.join(ROOT, 'deploy', 'konten', 'index.html'), 'utf8');


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


  /* ============ 1b. mengetik tidak menggambar ulang halaman ============ */
  console.log('\n== Konten: mengetik di antrian tidak melempar fokus ==');
  {
    const d = dom(jembatan(KONTEN), 'https://team.laksamanamuda.id/konten/');
    await tunggu(500);
    const w = d.window, doc = w.document;

    /* Inilah bentuk bug-nya: queueF() memanggil route(), route() menulis ulang
       innerHTML SELURUH #view — termasuk kotak carinya sendiri. Kotak yang
       dibuat ulang kehilangan fokus, jadi hanya huruf pertama yang masuk.
       Yang diuji karena itu: elemen input yang SAMA masih hidup sesudah
       menyaring, dan masih memegang fokus. */
    w.__uji("route('shooting')"); await tunggu(120);
    const kotak = doc.querySelector('#view input.ctrl');
    cek('kotak cari antrian ada', !!kotak);
    if (kotak) {
      kotak.focus();
      cek('kotak cari bisa difokus', doc.activeElement === kotak);
      w.__uji("queueF('shoot','q','abc')"); await tunggu(80);
      /* isConnected: elemen yang dibuang dari DOM oleh innerHTML tetap ada
         sebagai objek JS, jadi memeriksa `kotak` saja tidak membuktikan apa pun. */
      cek('kotak cari TIDAK dibuat ulang saat menyaring', kotak.isConnected === true);
      cek('fokusnya tidak lepas', doc.activeElement === kotak,
          doc.activeElement ? doc.activeElement.tagName + '.' + doc.activeElement.className : 'null');
    }
    /* Tabelnya tetap harus benar-benar tergambar ulang — kalau tidak, tapisnya
       jadi hiasan: fokus terjaga tapi hasilnya tidak pernah berubah. */
    cek('wadah tabel antrian ada', !!doc.querySelector('#queueTable'));
    cek('renderQueueTable dipakai, bukan route',
        /function queueF\(kind,key,val\)\{queueState\[kind\]\[key\]=val;renderQueueTable\(kind\);\}/.test(KONTEN_BARU()));
    d.window.close();
  }

  /* ================= 3. pipeline: tapis PIC ================= */
  console.log('\n== Pipeline bisa disaring per orang ==');
  {
    const d = dom(jembatan(KONTEN), 'https://team.laksamanamuda.id/konten/');
    await tunggu(500);
    const w = d.window;
    w.__uji(`DB.users = [{id:'u-a',name:'Ana'},{id:'u-b',name:'Budi'}];
      DB.content = [
        {id:'k1',title:'A1',status:'Editing',pic:'u-a',brand:'',pillar:''},
        {id:'k2',title:'A2',status:'Design',pic:'u-a',brand:'',pillar:''},
        {id:'k3',title:'B1',status:'Editing',pic:'u-b',brand:'',pillar:''},
        {id:'k4',title:'Yatim',status:'Idea',pic:'',brand:'',pillar:''}
      ]; brandFilter='all';`);

    cek('jumlah per orang dihitung', w.__uji("pipeHitung('u-a')") === 2 &&
        w.__uji("pipeHitung('u-b')") === 1,
        w.__uji("pipeHitung('u-a')") + '/' + w.__uji("pipeHitung('u-b')"));
    cek('tanpa tapis, semuanya tampil', w.__uji('pipeTersaring()').length === 4);
    w.__uji("pipeFilters.pic='u-a'");
    cek('tersaring ke satu orang',
        w.__uji('pipeTersaring()').map(c=>c.title).join(',') === 'A1,A2',
        w.__uji('pipeTersaring()').map(c=>c.title).join(','));
    /* '__none__' bukan id siapa pun. Dibandingkan langsung dengan c.pic ia
       tidak akan pernah cocok, dan kanbannya kosong tanpa satu pun keterangan. */
    w.__uji("pipeFilters.pic='__none__'");
    cek('pilihan Belum ada PIC benar-benar menyaring',
        w.__uji('pipeTersaring()').map(c=>c.title).join(',') === 'Yatim',
        w.__uji('pipeTersaring()').map(c=>c.title).join(','));
    w.__uji("pipeFilters.pic=''");
    const html = w.__uji('VIEWS.pipeline()');
    cek('pilihannya menyebut jumlah tiap orang',
        html.indexOf('Ana (2)') > -1 && html.indexOf('Budi (1)') > -1,
        html.slice(html.indexOf('Semua PIC'), html.indexOf('Semua PIC') + 300));
    cek('yang belum ada PIC ikut ditawarkan', html.indexOf('Belum ada PIC (1)') > -1);
    d.window.close();
  }

  /* ========= 4. dashboard: deadline saya, overdue & yang dekat ========= */
  console.log('\n== Dashboard: tugas SAYA yang lewat / dekat tenggat ==');
  {
    const d = dom(jembatan(KONTEN), 'https://team.laksamanamuda.id/konten/');
    await tunggu(500);
    const w = d.window;
    const geser = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0,10); };
    w.__uji(`SES='u-me';
      DB.users=[{id:'u-me',name:'Saya'},{id:'u-lain',name:'Orang Lain'}];
      DB.content=[
        {id:'c1',title:'Telat Berat',status:'Editing',pic:'u-me',brand:'',deadline:'${geser(-5)}'},
        {id:'c2',title:'Besok',status:'Design',pic:'u-me',brand:'',deadline:'${geser(1)}'},
        {id:'c3',title:'Bulan Depan',status:'Idea',pic:'u-me',brand:'',deadline:'${geser(30)}'},
        {id:'c4',title:'Punya Orang Lain',status:'Editing',pic:'u-lain',brand:'',deadline:'${geser(-9)}'},
        {id:'c5',title:'Sudah Tayang',status:'Posted',pic:'u-me',brand:'',deadline:'${geser(-9)}'}
      ];
      DB.prodTasks=[
        {id:'t1',kind:'edit',title:'Edit Reel',pic:'u-me',status:'todo',brand:'',date:'${geser(-2)}'},
        {id:'t2',kind:'shoot',title:'Rekam Orang Lain',pic:'u-lain',status:'todo',brand:'',date:'${geser(-2)}'},
        {id:'t3',kind:'design',title:'Sudah Beres',pic:'u-me',status:'done',brand:'',date:'${geser(-2)}'}
      ]; brandFilter='all';`);

    const my = w.__uji('tugasSaya()');
    const judul = my.map(x => x.title);
    /* HANYA punya yang login. Kartu yang ikut memajang pekerjaan orang lain
       membuat angka "terlambat" tidak bisa dipakai memutuskan apa pun. */
    cek('tugas orang lain tidak ikut',
        !judul.some(t => /Orang Lain/.test(t)), JSON.stringify(judul));
    cek('yang sudah tayang tidak ikut', !judul.some(t => /Sudah Tayang/.test(t)));
    cek('tugas produksi yang sudah beres tidak ikut', !judul.some(t => /Sudah Beres/.test(t)));
    /* DIKUMPULKAN DARI TIGA SUMBER. Kartu yang cuma membaca DB.content akan
       menulis "Bersih!" untuk orang yang besok harus menyerahkan video. */
    cek('tugas produksi mandiri ikut', judul.some(t => /Edit Reel/.test(t)), JSON.stringify(judul));
    /* Urut: yang paling lewat tenggat paling atas. Tanpa urutan ini kartunya
       cuma tujuh baris pertama menurut urutan input data, dan yang terlambat
       bisa tidak pernah kelihatan. */
    cek('yang paling terlambat di paling atas', /Telat Berat/.test(judul[0]), JSON.stringify(judul));
    cek('yang tenggatnya jauh di bawah', /Bulan Depan/.test(judul[judul.length-1]), JSON.stringify(judul));

    const lewat = my.filter(x => x.sisa != null && x.sisa < 0).length;
    const dekat = my.filter(x => x.sisa != null && x.sisa >= 0 && x.sisa <= w.__uji('DEADLINE_DEKAT')).length;
    cek('dua tugas saya sudah lewat tenggat', lewat === 2, String(lewat));
    cek('satu tugas saya jatuh tempo dekat', dekat === 1, String(dekat));

    const dash = w.__uji('VIEWS.dashboard()');
    cek('dashboard menyebut jumlah yang terlambat', /2 terlambat/.test(dash),
        dash.slice(dash.indexOf('Tugas Saya'), dash.indexOf('Tugas Saya') + 260));
    cek('dan yang jatuh tempo dekat', /1 ≤3 hari/.test(dash),
        dash.slice(dash.indexOf('Tugas Saya'), dash.indexOf('Tugas Saya') + 260));
    cek('kartu Terlambat menyebut porsi saya', /punya saya/.test(dash));
    d.window.close();
  }


  /* ========= 5. tampilan PIC: satu bentuk untuk dua halaman ========= */
  console.log('\n== Pilihan PIC seragam di Pipeline & Content Planning ==');
  {
    const d = dom(jembatan(KONTEN), 'https://team.laksamanamuda.id/konten/');
    await tunggu(500);
    const w = d.window;
    w.__uji(`SES='u-me';
      DB.users=[{id:'u-me',name:'Saya'},{id:'u-a',name:'Ana'},{id:'u-z',name:'Nganggur'}];
      DB.content=[
        {id:'k1',title:'M1',status:'Editing',pic:'u-me',brand:'',pillar:''},
        {id:'k2',title:'A1',status:'Design',pic:'u-a',brand:'',pillar:''},
        {id:'k3',title:'A2',status:'Idea',pic:'u-a',brand:'',pillar:''},
        {id:'k4',title:'Yatim',status:'Idea',pic:'',brand:'',pillar:''}
      ]; brandFilter='all'; pipeFilters={pic:''};
      planFilters={arsip:'aktif',status:'',platform:'',pillar:'',pic:'',q:''};`);

    /* SATU pembuat daftar untuk dua halaman: dua dropdown yang disusun
       sendiri-sendiri akan menyimpang begitu ada pilihan baru. */
    const opsi = w.__uji('picOptions("", pipeHitung)');
    cek('Punya saya ada di atas daftar nama',
        opsi.indexOf('Punya saya') > -1 &&
        opsi.indexOf('Punya saya') < opsi.indexOf('Ana'), opsi.replace(/</g,'\n<'));
    cek('jumlah tiap orang ikut tertulis',
        /Ana \(2\)/.test(opsi) && /Punya saya \(1\)/.test(opsi), opsi.replace(/</g,'\n<'));
    /* Orang yang tidak pegang apa-apa tidak ditawarkan: memilihnya cuma
       memulangkan daftar kosong, dan daftar kosong terbaca sebagai bug. */
    cek('yang tidak pegang apa-apa tidak ditawarkan', opsi.indexOf('Nganggur') < 0);
    cek('yang belum ada PIC ditawarkan', /Belum ada PIC \(1\)/.test(opsi), opsi.replace(/</g,'\n<'));
    cek('Semua PIC menyebut totalnya', /Semua PIC \(4\)/.test(opsi), opsi.replace(/</g,'\n<'));

    /* Aturan cocoknya juga satu: '__none__' bukan id siapa pun. */
    cek('picCocok: kosong berarti semua', w.__uji("picCocok('','u-a')") === true);
    cek('picCocok: __none__ hanya yang tanpa PIC',
        w.__uji("picCocok('__none__','')") === true &&
        w.__uji("picCocok('__none__','u-a')") === false);

    /* ---- Content Planning memakai daftar yang sama ---- */
    const plan = w.__uji('VIEWS.planning()');
    cek('Content Planning ikut menyebut jumlah tiap PIC',
        /Ana \(2\)/.test(plan), plan.slice(plan.indexOf('Semua PIC'), plan.indexOf('Semua PIC') + 260));
    cek('Content Planning ikut punya Punya saya', plan.indexOf('Punya saya') > -1);
    cek('Content Planning ikut punya Belum ada PIC', plan.indexOf('Belum ada PIC') > -1);
    /* Tapisnya benar-benar bekerja di halaman itu, bukan cuma tergambar. */
    w.__uji("planFilters.pic='u-a'");
    cek('tapis PIC menyaring daftar planning',
        w.__uji('filteredContent()').map(c=>c.title).join(',') === 'A1,A2',
        w.__uji('filteredContent()').map(c=>c.title).join(','));
    w.__uji("planFilters.pic='__none__'");
    cek('Belum ada PIC menyaring di planning juga',
        w.__uji('filteredContent()').map(c=>c.title).join(',') === 'Yatim',
        w.__uji('filteredContent()').map(c=>c.title).join(','));
    /* Angka di pilihan dihitung TANPA tapis PIC-nya sendiri. Kalau ikut, tiap
       nama yang tidak sedang dipilih selalu menulis (0) — dan nol membaca
       sebagai "orang itu tidak pegang apa-apa". */
    cek('angka PIC tidak jadi nol saat satu PIC dipilih',
        w.__uji("planHitungPic('u-a')") === 2, String(w.__uji("planHitungPic('u-a')")));
    /* ...tapi saringan LAIN tetap berlaku: angkanya harus menjanjikan apa yang
       benar-benar muncul kalau ditekan. */
    w.__uji("planFilters.pic=''; planFilters.q='A1';");
    cek('kata kunci ikut mempersempit angka PIC',
        w.__uji("planHitungPic('u-a')") === 1, String(w.__uji("planHitungPic('u-a')")));

    /* ---- Kerapiannya: kotaknya tidak lagi menumpang di .page-head ---- */
    w.__uji("planFilters.q=''");
    const pipe = w.__uji('VIEWS.pipeline()');
    const kepala = pipe.slice(pipe.indexOf('page-head'), pipe.indexOf('</div>', pipe.indexOf('page-head')) + 6);
    cek('pemilih PIC keluar dari page-head', kepala.indexOf('COMS.pipeF') < 0, kepala);
    cek('dan berdiri di kartu penyaring seperti halaman lain',
        /class="card"[^>]*>\s*<div[^>]*>\s*<select class="ctrl"[^>]*COMS\.pipeF/.test(pipe.replace(/\s+/g,' ')),
        pipe.slice(pipe.indexOf('COMS.pipeF') - 220, pipe.indexOf('COMS.pipeF') + 60));
    cek('jumlah konten aktif tetap disebut', /konten aktif/.test(pipe));
    d.window.close();
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
