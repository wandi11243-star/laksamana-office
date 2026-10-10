/* Uji halaman Tagihan Rutin di panel Kas Kecil (deploy/finance/kas/) —
   jsdom + finance-api tiruan yang HIDUP (apa yang ditulis tagihanSimpan /
   tagihanBayar / tagihanBatal dipulangkan tagihanList berikutnya), plus
   kontrak atas sumber PHP (lib_tagihan.php) karena php tidak ada di mesin
   pengembangan.

   Yang dijaga:
   - menunya benar-benar ada di sidebar + TITLES (halaman tanpa TITLES
     memantul balik, pelajaran modul DW);
   - jatuh tempo dihitung dari `mulai` + siklus, tanggal 31 dijepit ke akhir
     bulan, dan jatuh tempo lampau yang belum dibayar terhitung terlambat;
   - total dibayar = jumlah pembayaran HIDUP dengan nominal saat dibayar,
     bukan harga sekarang;
   - yang dibatalkan tidak ikut dijumlahkan, dan tidak ada DELETE;
   - satu jatuh tempo tidak bisa dibayar dua kali (penjaga di SERVER);
   - View Only tidak melihat tombol bayar. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* coba berikutnya */ }
  }
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2);
})();

const HTML = fs.readFileSync(path.join(ROOT, 'deploy', 'finance', 'kas', 'index.html'), 'utf8');
const PHP = fs.readFileSync(path.join(ROOT, 'finance-mysql', 'lib_tagihan.php'), 'utf8');
const API = fs.readFileSync(path.join(ROOT, 'finance-mysql', 'api.php'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function geserBulan(n) { const d = new Date(); d.setDate(10); d.setMonth(d.getMonth() + n); return iso(d); }

/* Server tiruan yang meniru aturan lib_tagihan.php — termasuk penjaga
   bayar-dua-kali dan pembatalan yang tidak menghapus. */
function server(awal) {
  const S = { tagihan: (awal && awal.tagihan || []).map(x => Object.assign({}, x)),
              bayar: (awal && awal.bayar || []).map(x => Object.assign({}, x)), nid: 100 };
  return {
    S,
    jawab(body) {
      const a = body.action;
      if (a === 'tagihanList') return { ok: true, data: { tagihan: S.tagihan, bayar: S.bayar.slice().sort((x, y) => x.tglBayar < y.tglBayar ? 1 : -1) } };
      if (a === 'tagihanSimpan') {
        const d = body.data;
        if (!d.nama) return { ok: false, error: 'Nama tagihan wajib diisi.' };
        if (d.id) { Object.assign(S.tagihan.find(t => t.id === d.id), d); return { ok: true, data: { id: d.id } }; }
        const id = ++S.nid; S.tagihan.push(Object.assign({ aktif: true }, d, { id })); return { ok: true, data: { id } };
      }
      if (a === 'tagihanAktif') { S.tagihan.find(t => t.id === body.id).aktif = !!body.aktif; return { ok: true, data: {} }; }
      if (a === 'tagihanBayar') {
        const d = body.data;
        if (S.bayar.some(b => b.tagihanId === d.tagihanId && b.periode === d.periode && !b.batalAt))
          return { ok: false, error: 'sudah tercatat dibayar' };
        S.bayar.push(Object.assign({}, d, { id: ++S.nid, oleh: body.oleh || '', batalAt: null }));
        return { ok: true, data: { id: S.nid } };
      }
      if (a === 'tagihanBatal') {
        const b = S.bayar.find(x => x.id === body.id && !x.batalAt);
        if (!b) return { ok: false, error: 'tidak ditemukan' };
        b.batalAt = Date.now(); b.batalAlasan = body.alasan; b.batalOleh = body.oleh || '';
        return { ok: true, data: {} };
      }
      return null;
    }
  };
}

function domKas(opt) {
  opt = opt || {};
  const srv = server(opt.awal);
  const kiriman = [];
  const dom = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/finance/kas/',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.prompt = () => (opt.prompt !== undefined ? opt.prompt : 'salah ketik');
      try {
        w.localStorage.setItem('lm_session', JSON.stringify(Object.assign({
          expiry: Date.now() + 3600000, userId: 'u-wandi', name: 'Wandi Pranata',
          modules: ['finance'], adminModules: ['finance']
        }, opt.sesi || {})));
      } catch (e) {}
      w.fetch = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1)
          return balas({ ok: true, members: [{ id: 'u-wandi', name: 'Wandi Pranata', keterangan: 'Office', isModuleAdmin: true }] });
        if (u.indexOf('kompas-api') > -1)
          return balas({ ok: true, data: { reports: {}, daily: [], settings: {}, rekap_setoran: [], piutang: [] } });
        if (u.indexOf('finance-api') > -1) {
          if (String(body.action || '').indexOf('tagihan') === 0) kiriman.push(body);
          const j = srv.jawab(body);
          if (j) return balas(j);
          return balas({ ok: true, data: { pos: [], kategori: [], trx: [], akses: opt.akses || {}, peran: opt.peran || {} } });
        }
        return balas({ ok: true, data: {} });
      };
    }
  });
  return { dom, srv, kiriman };
}
async function buka(w) { w.go('tagihan'); await tunggu(150); return w.document; }
const teks = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {
  console.log('\n== Menu, judul, router ==');
  {
    const { dom } = domKas();
    await tunggu(400);
    const w = dom.window, d = w.document;
    const a = d.querySelector('.nav a[data-view="tagihan"]');
    cek('menu Tagihan Rutin ada di sidebar', !!a);
    cek('menunya tidak disembunyikan', a && a.style.display !== 'none');
    cek('menunya di grup Kas Kecil', a && /Kas Kecil/.test(teks(a.closest('.nav-group').querySelector('.nav-label'))));
    a && a.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await tunggu(150);
    cek('diklik → halaman tagihan terbuka (tidak memantul)', w.eval('CURRENT') === 'tagihan', w.eval('CURRENT'));
    cek('judul halaman', /Tagihan Rutin/.test(teks(d.getElementById('pageTitle'))));
    cek('tagihan ada di AKS_HAL_ISI (punya isian)', w.eval("AKS_HAL_ISI.indexOf('tagihan')>=0"));
  }

  console.log('\n== Hitungan jatuh tempo ==');
  {
    const { dom } = domKas();
    await tunggu(300);
    const w = dom.window;
    cek('31 Jan + 1 bulan = 28 Feb', w.eval("tgTambahBulan('2026-01-31',1)") === '2026-02-28');
    cek('31 Jan 2028 + 1 bulan = 29 Feb (kabisat)', w.eval("tgTambahBulan('2028-01-31',1)") === '2028-02-29');
    cek('15 Nov + 3 bulan menyeberang tahun', w.eval("tgTambahBulan('2026-11-15',3)") === '2027-02-15');
    cek('tahunan', w.eval("tgTambahBulan('2026-10-05',12)") === '2027-10-05');
  }

  console.log('\n== Keadaan kosong & isi daftar awal ==');
  {
    const { dom, srv, kiriman } = domKas();
    await tunggu(300);
    const w = dom.window; const d = await buka(w);
    cek('daftar kosong mengatakannya', /Belum ada tagihan rutin/.test(teks(d.getElementById('app-view'))));
    const b = [...d.querySelectorAll('#app-view button')].find(x => /tagihan awal/.test(x.textContent));
    cek('ada tombol isi daftar awal', !!b);
    b && b.click();
    await tunggu(400);
    cek('ketujuh tagihan tersimpan ke server', srv.S.tagihan.length === 7, srv.S.tagihan.length);
    cek('lewat endpoint tagihanSimpan yang sama dengan form', kiriman.filter(k => k.action === 'tagihanSimpan').length === 7);
    cek('nama dari daftar user', srv.S.tagihan.some(t => t.nama === 'Wifi Biznet') && srv.S.tagihan.some(t => t.nama === 'Youtube Bulanan'));
    const v = teks(d.getElementById('app-view'));
    cek('yang belum lengkap disebut', /7 tagihan belum lengkap/.test(v), v.slice(0, 300));
    cek('chip jatuh tempo belum diisi', /jatuh tempo belum diisi/.test(v));
  }

  console.log('\n== Status, total, bayar, batal ==');
  {
    const m2 = geserBulan(-2), m1 = geserBulan(-1), m0 = geserBulan(0);
    const { dom, srv, kiriman } = domKas({ awal: {
      tagihan: [
        { id: 1, nama: 'Wifi Biznet', kategori: 'Internet', nominal: 450000, siklus: 1, mulai: m2, metode: '', catatan: '', aktif: true },
        { id: 2, nama: 'Claude Bulanan', kategori: 'Langganan Software', nominal: 400000, siklus: 12, mulai: geserBulan(5), metode: '', catatan: '', aktif: true }
      ],
      /* Nominal LAMA 400.000 — harga sekarang 450.000. Totalnya harus memakai
         angka saat dibayar. Satu lagi DIBATALKAN dan tidak boleh ikut. */
      bayar: [
        { id: 11, tagihanId: 1, periode: m2, tglBayar: m2, nominal: 400000, catatan: '', oleh: 'Cindy', batalAt: null },
        { id: 12, tagihanId: 1, periode: m1, tglBayar: m1, nominal: 999999, catatan: '', oleh: 'Cindy', batalAt: 123, batalAlasan: 'dobel' }
      ]
    } });
    await tunggu(300);
    const w = dom.window; const d = await buka(w);
    const st = w.eval('tgStatus(tgById(1))');
    cek('jatuh tempo bulan lalu belum dibayar → terlambat', st.jenis === 'telat', JSON.stringify(st));
    cek('jatuh tempo berikutnya = yang paling lama belum dibayar', st.next === m1, st.next);
    const v = teks(d.getElementById('app-view'));
    cek('total sudah dibayar Rp400.000 (yang dibatalkan tidak ikut)', /Total Sudah Dibayars*Rp400\.000/.test(v), v.slice(0, 200));
    cek('pita terlambat menyebut namanya', /1 tagihan terlambat: Wifi Biznet/.test(v));
    cek('perkiraan per bulan: tahunan dibagi 12', /Perkiraan per Bulans*Rp483\.333/.test(v), (v.match(/Perkiraan per Bulan[^R]*Rp[\d.]+/) || [''])[0]);

    const bayarBtn = [...d.querySelectorAll('#app-view button')].find(x => x.textContent === 'Bayar' && /tgBuka\(1,/.test(x.getAttribute('onclick')));
    cek('tombol Bayar ada', !!bayarBtn);
    bayarBtn.click(); await tunggu(50);
    cek('panel bayar terisi jatuh tempo terlambat', d.getElementById('tgb_per').value === m1, d.getElementById('tgb_per').value);
    cek('nominal terisi harga sekarang', /450/.test(d.getElementById('tgb_nom').value));
    d.getElementById('tgb_nom').value = '455.000';
    [...d.querySelectorAll('#app-view button')].find(x => /Simpan pembayaran/.test(x.textContent)).click();
    await tunggu(300);
    const kb = kiriman.find(k => k.action === 'tagihanBayar');
    cek('kiriman membawa nominal yang DIKETIK', kb && kb.data.nominal === 455000, kb && JSON.stringify(kb.data));
    cek('kiriman membawa periode jatuh tempo', kb && kb.data.periode === m1);
    cek('tersimpan di server', srv.S.bayar.length === 3);
    const v2 = teks(d.getElementById('app-view'));
    cek('total naik jadi Rp855.000', /Total Sudah Dibayars*Rp855\.000/.test(v2));
    const st2 = w.eval('tgStatus(tgById(1))');
    cek('sesudah dibayar, berikutnya bulan ini', st2.next === m0 && st2.telat === 0, JSON.stringify(st2));

    // bayar dua kali periode yang sama -> ditolak server, galat tampil
    w.eval("tgBuka(1,'bayar')"); await tunggu(30);
    d.getElementById('tgb_per').value = m1;
    w.eval('tgSimpanBayar(1)'); await tunggu(300);
    cek('periode yang sama tidak bisa dibayar dua kali', srv.S.bayar.filter(b => b.periode === m1 && !b.batalAt).length === 1);
    cek('galatnya disebut di layar', /sudah tercatat dibayar/.test(teks(d.getElementById('app-view'))));

    // batal
    const idBaru = srv.S.bayar.find(b => b.nominal === 455000).id;
    w.eval('tgBatal(' + idBaru + ')'); await tunggu(300);
    cek('pembatalan TIDAK menghapus baris', srv.S.bayar.length === 3);
    cek('pembatalan membawa alasan', srv.S.bayar.find(b => b.id === idBaru).batalAlasan === 'salah ketik');
    cek('total kembali Rp400.000', /Total Sudah Dibayars*Rp400\.000/.test(teks(d.getElementById('app-view'))));

    // riwayat tab + cari
    w.eval("tgTab('riwayat')"); await tunggu(50);
    const rw = d.getElementById('tg_rw');
    cek('riwayat memuat semua baris', rw && rw.querySelectorAll('tbody tr').length === 3);
    const kotak = d.querySelector('#app-view input.cari');
    kotak.value = 'cindy'; kotak.dispatchEvent(new w.Event('input', { bubbles: true }));
    cek('cari menyaring tanpa membuat ulang kotaknya', d.querySelector('#app-view input.cari') === kotak && d.getElementById('tg_rw').querySelectorAll('tbody tr').length === 2);

    // form ubah
    w.eval('tgUbah(2)'); await tunggu(30);
    cek('form ubah terisi', d.getElementById('tg_nama').value === 'Claude Bulanan' && d.getElementById('tg_sik').value === '12');
    d.getElementById('tg_nom').value = '420.000';
    w.eval('tgSimpanForm()'); await tunggu(300);
    cek('ubah tersimpan dengan nominal baru', srv.S.tagihan.find(t => t.id === 2).nominal === 420000);
    cek('pembayaran lama tidak ikut berubah', srv.S.bayar.find(b => b.id === 11).nominal === 400000);
  }

  console.log('\n== View Only ==');
  {
    const { dom } = domKas({ sesi: { adminModules: [] }, peran: { '#u-wandi': 'viewer' },
      awal: { tagihan: [{ id: 1, nama: 'Wifi CK', nominal: 300000, siklus: 1, mulai: geserBulan(0), aktif: true }], bayar: [] } });
    await tunggu(400);
    const w = dom.window; const d = await buka(w);
    cek('viewer bisa membuka halaman', w.eval('CURRENT') === 'tagihan');
    const b = [...d.querySelectorAll('#app-view button')].map(x => x.textContent);
    cek('viewer tidak melihat Bayar / Ubah', b.indexOf('Bayar') < 0 && b.indexOf('Ubah') < 0, b.join('|'));
    cek('viewer tetap bisa membuka Riwayat', b.indexOf('Riwayat') >= 0);
    cek('viewer tidak ditawari tab Tambah', b.join('|').indexOf('Tambah Tagihan') < 0);
  }

  console.log('\n== Kontrak PHP ==');
  {
    let parser = null;
    for (const p of [process.env.PHP_PARSER_PATH, path.join(ROOT, 'node_modules', 'php-parser'), 'php-parser']) {
      if (!p) continue; try { parser = require(p); break; } catch (e) {}
    }
    if (parser) {
      const P = new (parser.Engine || parser)({ parser: { php7: true }, ast: { withPositions: false } });
      for (const [n, s] of [['lib_tagihan.php', PHP], ['api.php', API]]) {
        let ok = true, err = '';
        try { P.parseCode(s); } catch (e) { ok = false; err = e.message; }
        cek('sintaks ' + n, ok, err);
      }
    } else console.log('  LEWAT sintaks PHP (php-parser tidak ada)');
    const tanpaKomentar = PHP.replace(/\/\*[\s\S]*?\*\//g, '');
    cek('tidak ada DELETE di lib_tagihan', !/DELETE\s+FROM/i.test(tanpaKomentar));
    cek('penjaga bayar dua kali memeriksa batal_at IS NULL', /`periode`=:per AND `batal_at` IS NULL/.test(PHP));
    cek('penjaga di dalam transaksi + FOR UPDATE', /beginTransaction[\s\S]*FOR UPDATE[\s\S]*commit/.test(tg_badan('tg_bayar')));
    cek('kelima aksi dirutekan', ['tagihanList', 'tagihanSimpan', 'tagihanAktif', 'tagihanBayar', 'tagihanBatal'].every(a => API.indexOf("case '" + a + "'") > -1));
    cek('tanggal diperiksa checkdate', /checkdate\(/.test(PHP));
  }

  console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
  process.exit(gagal ? 1 : 0);
})();

function tg_badan(nama) {
  const i = PHP.indexOf('function ' + nama + '(');
  const j = PHP.indexOf('\nfunction ', i + 10);
  return PHP.slice(i, j < 0 ? undefined : j);
}
