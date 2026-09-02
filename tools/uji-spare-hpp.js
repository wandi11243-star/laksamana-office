/* Uji SPARE MODAL di panel HPP (deploy/stock/hpp/) — jsdom + stock-api tiruan.

   Yang diuji di sini bukan tampilannya, tapi UANG: modal tiap menu ditambah
   cadangan sekian persen (setelan `buffer`, halaman Pengaturan), dan tiap salah
   di jalur ini muncul sebagai harga jual yang keliru — bukan sebagai galat.

   TIGA JEBAKAN YANG JUSTRU JADI ALASAN BERKAS INI ADA:

   1. SPARE BERLIPAT. Spare cuma boleh dikenakan pada menu jadi, sekali. Kalau
      base ikut dipadding, menu yang memakai base kena 5% di atas 5%, dan resep
      bertingkat tiga kena tiga kali. Angkanya tetap kelihatan wajar — tidak ada
      satu pun layar yang akan mengeluh.
   2. MEMO TERCEMAR. modalResep() memoize hasilnya dan memulangkan referensi
      yang SAMA tiap kali. Kalau modalMenu() menyunting objek itu alih-alih
      membuat yang baru, resep yang digambar dua kali dapat spare dua kali —
      jadi modalnya naik sendiri tiap halaman digambar ulang.
   3. DUA RUMUS UNTUK SATU ANGKA. Penyunting resep memakai modalPratinjau(),
      daftar memakai modalMenu(). Kalau cuma salah satunya kena spare, yang
      menyunting menyimpan lalu mendapati modalnya berubah tanpa ia mengubah
      apa pun. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* jsdom dicari di node_modules repo dulu, lalu lewat resolusi biasa — pola yang
   sama dengan tools/uji-brankas.js. */
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH ke foldernya.');
  process.exit(2);
})();

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'stock', 'hpp', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
/* S, F, dan KAL dideklarasikan dengan `let`, jadi ada di lingkup leksikal
   global halaman dan BUKAN di `window` — jebakan yang sudah dicatat di
   CLAUDE.md. Satu-satunya jalan masuk lewat eval di dalam halamannya. */
const resep = (w, id) => w.eval("S.resep.find(r=>r.id==='" + id + "')");

/* Angkanya dipilih supaya tiap jalur terlihat sebagai bilangan bulat — pecahan
   membuat kegagalan terbaca sebagai galat pembulatan padahal bukan.

     Ayam            Rp60.000 / 1000 Gr        -> Rp60 per Gr
     Ayam Karage     base, hasil 1000 Gr       -> modal 60.000, per unit 60
     Nasi Ayam       menu, 100 Gr Ayam Karage  -> bahan 6.000
     Botol Air       menu tanpa resep          -> modal ketikan 5.000
     Cabai           Rp20.000 / 1000 Gr        -> Rp20 per Gr
     Sambal Matah    base, hasil 100 Gr        -> modal 2.000, per unit 20
     Ayam Sambal     menu, dua base sekaligus  -> menguji spare bertingkat */
const BAHAN = [
  { id:'b1', nama:'Ayam',  satuan:'Gr', qty_beli:1000, harga_beli:60000 },
  { id:'b2', nama:'Cabai', satuan:'Gr', qty_beli:1000, harga_beli:20000 }
];
const RESEP = [
  { id:'r1', nama:'Ayam Karage', jenis:'food', tipe:'base', seksi:'Kitchen',
    yield_qty:1000, yield_unit:'Gr', aktif:1,
    bahan:[{ nama:'Ayam', qty:1000, satuan:'Gr', ref:'bahan' }] },
  { id:'r2', nama:'Nasi Ayam', jenis:'food', tipe:'dish', seksi:'Kitchen',
    yield_qty:1, yield_unit:'Porsi', aktif:1, harga_baru:20000,
    bahan:[{ nama:'Ayam Karage', qty:100, satuan:'Gr', ref:'resep' }] },
  { id:'r3', nama:'Botol Air', jenis:'drink', tipe:'dish', seksi:'Bar',
    yield_qty:1, yield_unit:'Botol', aktif:1, harga_baru:10000,
    modal_manual:5000, bahan:[] },
  /* Base DI DALAM base — inilah bentuk yang membuat spare berlipat tiga kalau
     paddingnya dikenakan di modalResep(). */
  { id:'r4', nama:'Sambal Matah', jenis:'food', tipe:'base', seksi:'Kitchen',
    yield_qty:100, yield_unit:'Gr', aktif:1,
    bahan:[{ nama:'Cabai', qty:100, satuan:'Gr', ref:'bahan' }] },
  { id:'r5', nama:'Ayam Sambal', jenis:'food', tipe:'dish', seksi:'Kitchen',
    yield_qty:1, yield_unit:'Porsi', aktif:1, harga_baru:30000,
    bahan:[{ nama:'Ayam Karage', qty:100, satuan:'Gr', ref:'resep' },
           { nama:'Sambal Matah', qty:50, satuan:'Gr', ref:'resep' }] }
];

function domHpp(setting) {
  const dom = new JSDOM(HTML, { runScripts:'dangerously', url:'https://dev.laksamanamuda.id/stock/hpp/',
                                pretendToBeVisual:true, beforeParse(w) {
    w.localStorage.setItem('lm_session', JSON.stringify({
      userId:'u1', name:'Uji HPP', modules:['hpp'], adminModules:['hpp'],
      expiry: Date.now() + 3600e3 }));
    /* Dua endpoint: hpp.php?action=all dan items.php. Keduanya dibalas dari
       sini, jadi ujinya tidak pernah menyentuh jaringan. */
    w.fetch = (url) => {
      const u = String(url);
      const body = u.indexOf('items.php') > -1
        ? { products:{} }
        : { status:'success', bahan:BAHAN, resep:RESEP,
            setting: Object.assign({ targetFood:0.33, targetDrink:0.33, buffer:0.05,
                                     lampuKuning:3, lampuMerah:8 }, setting || {}) };
      const teks = JSON.stringify(body);
      return Promise.resolve({ ok:true, status:200,
        text:() => Promise.resolve(teks), json:() => Promise.resolve(body) });
    };
    w.print = () => {};
    w.alert = () => {};
    w.confirm = () => true;
  }});
  return dom;
}

(async () => {

  /* ================= 1. base tidak kena spare ================= */
  console.log('\n== Base tidak kena spare ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const base = resep(w,'r1');
    const m = w.modalMenu(base);
    cek('modal base tetap telanjang', m.total === 60000, String(m.total));
    cek('spare base nol', m.spare === 0, String(m.spare));
    /* Harga per satuan base inilah yang menyusun modal resep lain. Kalau ia
       sudah membawa spare, menu yang memakainya dipadding dua kali. */
    cek('per unit base tanpa spare', w.perUnitResep(base) === 60, String(w.perUnitResep(base)));
    /* Berlaku untuk MENU JADI juga kalau ia dirujuk sebagai bahan — bisa terjadi
       lewat "⇄ Dari resep" di Bahan & Harga. Angka ini menyusun modal orang
       lain, jadi ia harus telanjang apa pun tipe resepnya. */
    cek('per unit menu jadi juga telanjang', w.perUnitResep(resep(w,'r2')) === 6000,
        String(w.perUnitResep(resep(w,'r2'))));
    dom.window.close();
  }

  /* ================= 2. menu jadi kena spare sekali ================= */
  console.log('\n== Menu jadi kena spare, SEKALI ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const menu = resep(w,'r2');
    const m = w.modalMenu(menu);
    cek('modal bahan dipulangkan terpisah', m.bahan === 6000, String(m.bahan));
    cek('spare 5% dari modal bahan', m.spare === 300, String(m.spare));
    cek('total = bahan + spare', m.total === 6300, String(m.total));
    /* 6.615 = 6.000 × 1,05 × 1,05. Itulah angka yang keluar kalau base ikut
       dipadding — beda 315 rupiah yang tidak akan dipertanyakan siapa pun. */
    cek('TIDAK berlipat lewat base', m.total !== 6615, String(m.total));
    cek('COGS dihitung dari modal bersepare', Math.abs(w.cogsOf(menu) - 6300/20000) < 1e-9,
        String(w.cogsOf(menu)));
    dom.window.close();
  }

  /* ================= 3. resep bertingkat ================= */
  console.log('\n== Resep bertingkat tetap sekali ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const m = w.modalMenu(resep(w,'r5'));
    /* Ayam Karage : 60.000/1000 Gr = 60/Gr, dipakai 100 Gr -> 6.000
       Sambal Matah: Cabai 20.000/1000 Gr = 20/Gr, 100 Gr -> modal 2.000,
                     hasil 100 Gr -> 20/Gr, dipakai 50 Gr -> 1.000            */
    cek('modal bahan dua base dijumlahkan', m.bahan === 7000, String(m.bahan));
    cek('spare sekali di atas keduanya', m.spare === 350, String(m.spare));
    /* 7.367,5 = (6.000×1,05 + 1.000×1,05×1,05) × 1,05 — angka yang keluar kalau
       tiap tingkat resep ikut dipadding. Bedanya cuma Rp17,50 di satu menu, dan
       justru itu yang membuatnya tidak akan pernah dipertanyakan. */
    cek('total 7.350, bukan bertingkat', m.total === 7350, String(m.total));
    dom.window.close();
  }

  /* ================= 4. MEMO tidak tercemar ================= */
  console.log('\n== Dipanggil berkali-kali tetap sama ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const menu = resep(w,'r2');
    const a = w.modalMenu(menu).total, b = w.modalMenu(menu).total, c = w.modalMenu(menu).total;
    cek('tiga panggilan berturut-turut sama', a === 6300 && b === 6300 && c === 6300,
        [a, b, c].join(' / '));
    /* Objek MEMO milik modalResep tidak boleh ikut membesar — kalau tersunting,
       modal base-nya sendiri yang naik dan seluruh menu ikut terseret. */
    cek('modal base tidak ikut naik', w.modalDasar(resep(w,'r1')).total === 60000,
        String(w.modalDasar(resep(w,'r1')).total));
    /* Digambar ulang tiga kali: inilah bentuk nyata jebakan MEMO — halaman ini
       menggambar total tiap render, bukan diferensial. */
    w.go('resep'); w.render(); w.render();
    cek('sesudah tiga kali render pun tetap', w.modalMenu(menu).total === 6300,
        String(w.modalMenu(menu).total));
    dom.window.close();
  }

  /* ================= 5. modal ketikan tangan ================= */
  console.log('\n== Menu tanpa resep (modal ketikan) ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const m = w.modalMenu(resep(w,'r3'));
    cek('modal ketikan jadi modal bahan', m.bahan === 5000, String(m.bahan));
    cek('ikut kena spare', m.spare === 250, String(m.spare));
    cek('ditandai manual', m.manual === true, String(m.manual));
    dom.window.close();
  }

  /* ================= 6. penyunting = daftar ================= */
  console.log('\n== Penyunting dan daftar menyebut angka yang sama ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const menu = resep(w,'r2');
    const pra = w.modalPratinjau(menu), jadi = w.modalMenu(menu);
    cek('modalPratinjau total sama dengan modalMenu', pra.total === jadi.total,
        pra.total + ' vs ' + jadi.total);
    cek('rincian spare-nya juga sama', pra.spare === jadi.spare && pra.bahan === jadi.bahan,
        pra.spare + '/' + pra.bahan);
    const base = resep(w,'r1');
    cek('base di penyunting juga tanpa spare', w.modalPratinjau(base).spare === 0,
        String(w.modalPratinjau(base).spare));
    dom.window.close();
  }

  /* ================= 7. persentasenya bisa disetel ================= */
  console.log('\n== Persentase bisa diubah ==');
  {
    const dom = domHpp({ buffer:0.10 }); await tunggu(120);
    const w = dom.window;
    const m = w.modalMenu(resep(w,'r2'));
    cek('10% terbaca dari setelan server', m.spare === 600 && m.total === 6600,
        m.spare + ' / ' + m.total);
    dom.window.close();
  }
  {
    const dom = domHpp({ buffer:0 }); await tunggu(120);
    const w = dom.window;
    const m = w.modalMenu(resep(w,'r2'));
    /* Nol WAJIB sah — itu satu-satunya cara mematikan spare tanpa menyunting
       kode, dan setelan yang tidak bisa dimatikan bukan setelan. */
    cek('nol mematikan spare', m.spare === 0 && m.total === 6000, m.spare + ' / ' + m.total);
    dom.window.close();
  }
  {
    const dom = domHpp({ buffer:-0.2 }); await tunggu(120);
    const w = dom.window;
    const m = w.modalMenu(resep(w,'r2'));
    /* Buffer negatif MENGURANGI modal — modal yang lebih murah daripada
       bahannya adalah angka menyesatkan yang tidak akan dipertanyakan. */
    cek('negatif diabaikan, bukan dipakai', m.total === 6000, String(m.total));
    dom.window.close();
  }

  /* ================= 8. kalkulator ikut ================= */
  console.log('\n== Kalkulator HPP ikut menghitung spare ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    w.eval("KAL = { baris:[{ nama:'Ayam', qty:100, satuan:'Gr', ref:'bahan' }], hargaJual:'20000', porsi:1 }");
    const k = w.kalTotal();
    cek('modal bahan 6.000', k.bahan === 6000, String(k.bahan));
    /* Kalkulator menimbang menu yang AKAN dijual. Tanpa spare, harga yang
       diputuskan di sini selalu lebih murah daripada yang keluar di Daftar
       Resep begitu menunya benar-benar dibuat. */
    cek('totalnya sudah bersepare', k.t === 6300, String(k.t));
    dom.window.close();
  }

  /* ================= 9. yang terbaca di layar ================= */
  console.log('\n== Layar mengatakan angkanya sudah bersepare ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window, d = w.document;
    w.go('resep'); await tunggu(40);
    const v = d.getElementById('view').innerHTML;
    /* Angka yang diam-diam 5% lebih besar daripada jumlah bahannya adalah
       selisih yang dicari orang berjam-jam di tempat yang salah. */
    cek('daftar menu menyebut spare', v.indexOf('sudah termasuk spare 5%') > -1);
    cek('modal bersepare tergambar', v.indexOf('Rp6.300') > -1,
        v.slice(Math.max(0, v.indexOf('Nasi Ayam') - 60), v.indexOf('Nasi Ayam') + 400));
    w.eval("F.tab='base'"); w.render(); await tunggu(40);
    const vb = d.getElementById('view').innerHTML;
    cek('tabel base TIDAK menyebut spare', vb.indexOf('sudah termasuk spare') < 0);

    w.go('atur'); await tunggu(40);
    const va = d.getElementById('view').innerHTML;
    cek('Pengaturan menamainya Spare modal', va.indexOf('Spare modal (%)') > -1);
    cek('dan menjelaskan base tidak ikut', va.indexOf('menu jadi saja') > -1);
    dom.window.close();
  }

  /* ================= 10. lembar cetak ================= */
  console.log('\n== Lembar PDF merinci spare ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window;
    const t = w.lembarResep(resep(w,'r2'), 1);
    /* Lembar ini dipegang orang dapur sambil menghitung ulang di kertas: total
       yang lebih besar daripada jumlah subtotal di atasnya akan dikira salah
       hitung, dan yang mencari selisihnya tidak punya satu pun petunjuk. */
    cek('ada baris Modal bahan', t.indexOf('Modal bahan') > -1);
    cek('ada baris Spare 5%', t.indexOf('Spare 5%') > -1);
    cek('TOTAL MODAL memakai angka bersepare', t.indexOf('Rp6.300') > -1);
    const tb = w.lembarResep(resep(w,'r1'), 1);
    cek('lembar base tidak punya baris spare', tb.indexOf('Spare') < 0);
    dom.window.close();
  }


  /* ================= 11. tapis Makanan / Minuman ================= */
  /* Tapisnya sudah ada sejak lama, tapi berupa DROPDOWN bertuliskan
     "Food" / "Drink" — satu dari empat kotak pilihan berjajar. Yang mencari
     "minuman" tidak menemukannya lalu menyimpulkan tapisnya tidak ada
     (permintaan user 2 September 2026). Sekarang saklar, dan berbahasa yang
     sama dengan yang mencarinya. */
  console.log('\n== Tapis Makanan / Minuman ==');
  {
    const dom = domHpp(); await tunggu(120);
    const w = dom.window, d = w.document;
    w.go('resep'); await tunggu(60);
    const tombol = () => Array.from(d.querySelectorAll('#view .seg button'))
      .filter(b => /Makanan|Minuman|Semua/.test(b.textContent));
    cek('ada tiga tombol jenis', tombol().length === 3,
        tombol().map(b => b.textContent.trim()).join(' | '));
    cek('tulisannya bahasa Indonesia',
        tombol().map(b => b.textContent).join(' ').indexOf('Food') < 0 &&
        d.getElementById('view').innerHTML.indexOf('>Drink<') < 0);
    cek('bawaannya Semua', tombol()[0].classList.contains('active'));

    /* Angka di tombol dihitung TANPA tapis jenis. Kalau ikut, tombol yang
       tidak sedang dipilih selalu menulis (0) — dan nol membaca sebagai
       "tidak ada minuman sama sekali", bukan "kamu sedang melihat makanan".
       Data ujinya: 2 menu jadi (Nasi Ayam & Ayam Sambal = makanan) dan
       1 minuman (Botol Air). */
    const angka = () => tombol().map(b => Number((b.textContent.match(/(\d+)\s*$/) || [])[1]));
    cek('angka awal 3 / 2 / 1', JSON.stringify(angka()) === '[3,2,1]', JSON.stringify(angka()));

    tombol().find(b => b.textContent.indexOf('Minuman') > -1).click();
    await tunggu(60);
    cek('menekan Minuman menyaring ke satu baris',
        w.resepTersaring('dish').length === 1, String(w.resepTersaring('dish').length));
    cek('yang tersisa memang minuman',
        w.resepTersaring('dish')[0].jenis === 'drink', w.resepTersaring('dish')[0].jenis);
    cek('angkanya TIDAK berubah jadi 0',
        JSON.stringify(angka()) === '[3,2,1]', JSON.stringify(angka()));
    cek('tombol Minuman yang menyala',
        tombol().find(b => b.textContent.indexOf('Minuman') > -1).classList.contains('active'));

    tombol().find(b => b.textContent.indexOf('Makanan') > -1).click();
    await tunggu(60);
    cek('menekan Makanan menyaring ke dua baris',
        w.resepTersaring('dish').length === 2, String(w.resepTersaring('dish').length));
    /* Jalan kembali. Tapis tanpa cara membatalkannya berarti terkurung di
       satu jenis sampai halaman dimuat ulang. */
    tombol()[0].click(); await tunggu(60);
    cek('Semua mengembalikan ketiganya', w.resepTersaring('dish').length === 3,
        String(w.resepTersaring('dish').length));

    /* Nilai tersimpannya TETAP 'food'/'drink' — itu isi kolom `jenis` di
       data. Kalau saklarnya mengirim 'makanan', tidak ada satu pun resep yang
       cocok dan daftarnya kosong tanpa satu pun galat. */
    cek('nilai tapis tetap food/drink',
        d.getElementById('view').innerHTML.indexOf("F.jenis='drink'") > -1 &&
        d.getElementById('view').innerHTML.indexOf("F.jenis='food'") > -1);

    /* Tapis lain TETAP berlaku saat menghitung angkanya: angka di tombol
       harus menjanjikan apa yang benar-benar muncul kalau ditekan. */
    w.eval("F.q='botol'"); w.render(); await tunggu(60);
    cek('kata kunci ikut mempersempit angkanya',
        JSON.stringify(angka()) === '[1,0,1]', JSON.stringify(angka()));
    dom.window.close();
  }


  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
