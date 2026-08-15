/* =====================================================================
 * BERSAMA untuk tiga modul pencatatan Stock:
 *   stock/usage/   — pemakaian bahan untuk event
 *   stock/waste/   — waste produk
 *   stock/opname/  — daily stock opname
 *
 * Dibuat sebagai berkas bersama, BUKAN disalin tiga kali. Ketiganya butuh
 * hal yang persis sama: gerbang sesi Office, cangkang halaman, pemanggil
 * API, notifikasi, pemilih tanggal, dan daftar bahan untuk autocomplete.
 * Tiga salinan berarti tiap perbaikan harus dikerjakan tiga kali — dan
 * yang terlupa satu akan berbeda perilaku tanpa ada yang menyadarinya.
 *
 * Modul lama (ordering, purchasing) sengaja TIDAK diubah untuk memakai ini.
 * Keduanya sudah berjalan dan dipakai kru tiap hari; membongkarnya demi
 * kerapian adalah risiko tanpa imbalan.
 * ===================================================================== */

/* ---------------------------------------------------------------- SESI */

/* Identitas datang dari Office (lm_session) — tidak ada login sendiri di
   modul ini. Mengembalikan null bila sesi habis atau tak berhak. */
function sesiOffice(kunciModul) {
  try {
    const s = JSON.parse(localStorage.getItem('lm_session') || 'null');
    if (!s || !s.expiry || Date.now() > s.expiry) return null;
    const m = s.modules || [];
    /* Yang menentukan HANYA kunci modul ini sendiri ('usage', nanti 'waste'
       & 'opname'). Sempat menumpang izin ordering/purchasing supaya kru tak
       perlu diberi izin baru — tapi izin yang tak bisa dicabut bukan izin,
       dan modulnya juga tidak muncul di Kelola Akses untuk diatur. */
    return (m.includes('*') || m.includes(kunciModul)) ? s : null;
  } catch (e) { return null; }
}

/* Tim/divisi pemilik sesi. Dipakai untuk mengisi kolom `tim` pada catatan
   baru — direkam SAAT mencatat, supaya tetap benar walau orangnya kemudian
   pindah divisi. Diambil dari daftar kru modul stock yang sudah ada di
   localStorage; kalau tak ketemu, dibiarkan kosong (bukan ditebak). */
function timSesi(sesi) {
  if (!sesi) return '';
  try {
    const kru = JSON.parse(localStorage.getItem('laksamana_users') || '[]');
    const u = kru.find(x => String(x.name || '').toLowerCase() === String(sesi.name || '').toLowerCase());
    return (u && u.keterangan) ? String(u.keterangan).trim() : '';
  } catch (e) { return ''; }
}

/* ----------------------------------------------------------------- API */

// Semua endpoint memakai path RELATIF ke stock-api-mysql, seperti modul lain.
// Ini yang membuat dev menulis ke db_dev_stock dan produksi ke db_stock tanpa
// cabang kode — jangan diganti jadi URL absolut.
const API_DIR = '../../stock-api-mysql/';

/* Token sesi Office, dikirim di SETIAP permintaan sebagai bukti identitas.
   Server memakainya untuk tahu siapa pemanggilnya (lihat pur_whoami di
   lib_stock_catat.php) — itulah yang membuat pembatasan per tim bisa
   ditegakkan di server, bukan cuma disembunyikan di layar.

   Dibaca ulang tiap kali, bukan disimpan di konstanta: sesi bisa berganti
   di tab lain, dan nilai yang dibekukan saat berkas dimuat akan basi. */
function tokenSesi() {
  try {
    const s = JSON.parse(localStorage.getItem('lm_session') || 'null');
    return (s && s.token) || '';
  } catch (e) { return ''; }
}

async function apiGet(berkas, params) {
  const q = new URLSearchParams(Object.assign({ t: Date.now(), sesi: tokenSesi() }, params || {}));
  const res = await fetch(`${API_DIR}${berkas}?${q}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiPost(berkas, body) {
  const res = await fetch(`${API_DIR}${berkas}`, {
    method: 'POST',
    // text/plain = simple request, tidak memicu preflight CORS. Sama seperti
    // endpoint stock lainnya; server membaca php://input, bukan $_POST.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ sesi: tokenSesi() }, body))
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ------------------------------------------------------------ TAMPILAN */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Notifikasi melayang. Tidak memakai alert(): itu menghentikan seluruh
// halaman, dan di sebagian browser bisa disenyapkan pengguna.
function toast(judul, pesan, jenis) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const warna = jenis === 'ok' ? 'var(--ok)' : jenis === 'err' ? 'var(--danger)' : 'var(--warn)';
  const el = document.createElement('div');
  el.className = 'fade-in px-4 py-3 max-w-sm pointer-events-auto';
  // Rel warna 4px di kiri: bentuk yang sama dengan kartu .recap, supaya
  // notifikasi terbaca sebagai bagian dari sistem yang sama.
  el.style.cssText = 'background:var(--surface);border:1px solid var(--line);border-left:4px solid ' + warna +
                     ';border-radius:var(--radius);box-shadow:var(--shadow-lg)';
  el.innerHTML = `<div class="text-[14px] font-semibold" style="color:var(--ink)">${esc(judul)}</div>` +
                 (pesan ? `<div class="text-[12.5px] mt-0.5 leading-relaxed" style="color:var(--muted)">${esc(pesan)}</div>` : '');
  wrap.appendChild(el);
  // Galat dibiarkan lebih lama: itu yang perlu dibaca sampai habis.
  setTimeout(() => el.remove(), jenis === 'err' ? 6000 : 3500);
}

/* --------------------------------------------------------------- WAKTU */

/* Tanggal lokal, BUKAN toISOString(). toISOString mengubah ke UTC dulu, dan
   di WIB itu memundurkan tanggal untuk tiap jam sebelum pukul 07:00 — kru
   yang mencatat waste subuh akan tercatat di hari kemarin. */
function ymdLokal(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hariIni() { return ymdLokal(new Date()); }
function tglGeser(hari) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + hari);
  return ymdLokal(d);
}
function fmtTgl(s) {
  if (!s) return '-';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTglPendek(s) {
  if (!s) return '-';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function fmtWaktu(s) {
  if (!s) return '-';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? s : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* -------------------------------------------------- DAFTAR BAHAN BAKU */

/* Nama bahan diambil dari items.php — sumber yang SAMA dengan form order,
   supaya nama yang dicatat di sini bisa dicocokkan dengan yang dipesan.
   Kalau tiap modul punya daftar nama sendiri, "Ayam Paha" dan "Ayam paha"
   akan jadi dua barang berbeda saat direkap.

   Disimpan ke localStorage supaya tetap bisa dipakai saat jaringan mati —
   pencatatan waste sering dilakukan di gudang yang sinyalnya buruk. */
let DAFTAR_BAHAN = [];
let INFO_BAHAN = {};

async function muatBahan() {
  try {
    const d = await apiGet('items.php');
    if (d && d.products) {
      DAFTAR_BAHAN = Object.keys(d.products);
      INFO_BAHAN = d.products;
      localStorage.setItem('stock_catat_bahan', JSON.stringify(DAFTAR_BAHAN));
      try { localStorage.setItem('stock_catat_bahan_info', JSON.stringify(INFO_BAHAN)); } catch (e) {}
    }
  } catch (e) {
    try {
      DAFTAR_BAHAN = JSON.parse(localStorage.getItem('stock_catat_bahan') || '[]');
      INFO_BAHAN = JSON.parse(localStorage.getItem('stock_catat_bahan_info') || '{}');
    } catch (e2) { DAFTAR_BAHAN = []; INFO_BAHAN = {}; }
  }
}

/* Satuan yang sah untuk sebuah bahan. null = belum diatur purchasing, dan
   itu berarti SEMUA satuan boleh — perilaku yang sama dengan form order,
   supaya dua halaman tidak memberi jawaban berbeda untuk bahan yang sama. */
// "Liter" ditambahkan 31 Juli 2026, "Porsi" 6 Agustus 2026 — lihat catatan di
// SATUAN_TERSEDIA ordering/purchasing. Ketiganya HARUS tetap sama persis.
const SATUAN_TERSEDIA = ["Kg", "Gram", "Liter", "ML", "Pcs", "Porsi", "Pack", "Dus", "Sack", "Jerigen", "Rim", "Botol",
                         "Ekor", "Slice", "Tabung", "Bal", "Buah", "Kaleng", "Ikat", "Papan"];
function satuanBahan(nama) {
  const p = INFO_BAHAN && INFO_BAHAN[nama];
  const s = p && Array.isArray(p.satuan) ? p.satuan.filter(Boolean) : [];
  return s.length ? s : null;
}
/* Satuan yang PUNYA UKURAN ikut ditawarkan (15 Agustus 2026). Purchasing bisa
   menetapkan satuan terkecil sebuah barang berikut ukuran satuan lainnya, dan
   namanya bebas — "Botol Besar" tidak ada di SATUAN_TERSEDIA, yang cuma punya
   satu "Botol". Server sudah menambahkannya ke `satuan`, TAPI hanya untuk
   barang yang daftarnya tidak kosong (kosong = semua satuan boleh, dan
   mengisinya justru mempersempit). Untuk barang seperti itu, dari sinilah
   satuannya datang. Ukurannya ikut ditulis di label karena di layar inilah
   orang memilih — membukanya di modul lain berarti menebak. */
function ukuranBahan(nama) {
  const p = INFO_BAHAN && INFO_BAHAN[nama];
  const isi = {};
  const v = p && p.isi;
  if (v && typeof v === 'object') Object.keys(v).forEach(k => {
    const s = String(k).trim(); if (s && Number(v[k]) > 0) isi[s] = Number(v[k]);
  });
  return { dasar: String((p && p.satuanDasar) || '').trim(), isi: isi };
}
function opsiSatuan(nama, terpilih) {
  const u = ukuranBahan(nama);
  const daftar = (satuanBahan(nama) || SATUAN_TERSEDIA).slice();
  const tambah = x => { if (x && !daftar.some(y => y.toLowerCase() === x.toLowerCase())) daftar.push(x); };
  if (u.dasar) tambah(u.dasar);
  Object.keys(u.isi).forEach(tambah);
  const pakai = daftar.includes(terpilih) ? terpilih : daftar[0];
  return daftar.map(x => {
    const kunci = Object.keys(u.isi).find(k => k.toLowerCase() === x.toLowerCase());
    const label = kunci ? `${x} (${u.isi[kunci]} ${u.dasar})` : x;
    return `<option value="${esc(x)}"${x === pakai ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

/* Autocomplete nama bahan. Dipasang ke sebuah <input> + wadah hasil.
   Bahan di luar daftar TIDAK ditolak di sini (beda dari form order):
   waste bisa saja produk jadi yang tak pernah dipesan sebagai bahan baku,
   mis. "Nasi Goreng porsi jadi". Yang ada di daftar cuma dipermudah. */
function pasangAutocomplete(input, wadah, onPilih) {
  const tutup = () => wadah.classList.add('hidden');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) return tutup();
    const cocok = DAFTAR_BAHAN.filter(x => x.toLowerCase().includes(q)).slice(0, 8);
    if (!cocok.length) return tutup();
    wadah.innerHTML = cocok.map(x =>
      `<div class="px-3 py-2 text-[13px] font-medium cursor-pointer ac-item"
            style="color:var(--ink);border-bottom:1px solid var(--line)"
            onmousedown="event.preventDefault()">${esc(x)}</div>`).join('');
    [...wadah.children].forEach((el, i) => {
      el.addEventListener('mousedown', () => {
        input.value = cocok[i];
        tutup();
        if (onPilih) onPilih(cocok[i]);
      });
    });
    wadah.classList.remove('hidden');
  });
  input.addEventListener('blur', () => setTimeout(tutup, 120));
}

/* ------------------------------------------------------------- CANGKANG */

/* Sidebar & topbar dipasang dari sini supaya ketiga halaman terlihat sama
   dan sejajar dengan Ordering/Purchasing. `aktif` menentukan menu mana yang
   disorot. */
/* `tampilan` = sub menu DI DALAM halaman ini, mis. [{v,ico,label}] untuk
   "Catat Baru" dan "Catatan Tercatat". Berbeda dari `menu` yang berpindah
   halaman: yang ini cuma menukar bagian yang terlihat, jadi isian form tidak
   hilang dan tidak ada muat ulang. */
/* Gaya "ciut ke ikon" untuk sidebar stock (Tailwind). Disuntik sekali karena
   utility class Tailwind tidak bisa menyembunyikan label teks secara selektif.
   Hanya berlaku di desktop (md+); di HP sidebar sudah tersembunyi (mobile-tabs). */
function pasangGayaMini() {
  if (document.getElementById('nav-mini-style')) return;
  var st = document.createElement('style');
  st.id = 'nav-mini-style';
  st.textContent =
    '@media(min-width:768px){' +
    // 66px = lebar sidebar ciut modul Reservasi (#app.nav-hidden .sidebar).
    '#app-sidebar.nav-mini{width:66px}' +
    '#app-sidebar.nav-mini .nav-lbl,#app-sidebar.nav-mini .nav-brand-txt,#app-sidebar.nav-mini .nav-user-txt,#app-sidebar.nav-mini .nav-sec-lbl{display:none}' +
    '#app-sidebar.nav-mini nav a,#app-sidebar.nav-mini nav button{justify-content:center;gap:0;padding-left:0;padding-right:0}' +
    '#app-sidebar.nav-mini .nav-brand{justify-content:center;padding-left:0;padding-right:0}' +
    '#app-sidebar.nav-mini .nav-mini-btn{margin:0}' +
    '#app-sidebar.nav-mini .nav-user-row{flex-direction:column;gap:8px}' +
    '}';
  document.head.appendChild(st);
}
/* Ciutkan menu ke ikon (desktop). Diingat per perangkat. */
window.toggleNav = function () {
  var s = document.getElementById('app-sidebar');
  var mini = !s.classList.contains('nav-mini');
  s.classList.toggle('nav-mini', mini);
  try { localStorage.setItem('lm_stock_navmini', mini ? '1' : '0'); } catch (e) {}
};

function pasangCangkang(aktif, judul, deskripsi, sesi, tampilan) {
  /* Hanya modul yang HALAMANNYA SUDAH ADA yang boleh masuk menu. Waste dan
     Opname backend-nya sudah siap (waste.php, opname.php) tapi halamannya
     belum dibuat — menautkannya sekarang cuma menghasilkan 404, dan tautan
     mati lebih membingungkan daripada menu yang belum lengkap. Tambahkan
     barisnya di sini begitu halamannya jadi. */
  const menu = [
    /* Kunci modulnya TETAP 'usage' walau namanya kini "Pemakaian Bahan Baku".
       Kunci itu identitas izin yang sudah tersimpan di tabel grants; menggantinya
       berarti mencabut akses semua orang yang sudah diberi. Nama tampilan bebas
       berubah, kuncinya tidak. */
    { k: 'usage',  href: '../usage/',  ico: 'fa-calendar-day', label: 'Pemakaian Bahan Baku' },
  ];
  const views = tampilan || [];
  /* Tautan antar modul hanya ditampilkan kalau modulnya memang lebih dari
     satu. Sekarang cuma ada satu, jadi menampilkannya berarti satu baris menu
     yang menuju halaman yang sedang dibuka — dan itu mendorong sub menu yang
     benar-benar berguna turun ke bawah. Begitu waste/opname jadi, barisnya
     muncul sendiri tanpa perlu menyentuh kode ini lagi. */
  const tampilkanMenuModul = menu.length > 1;
  const nama = (sesi && sesi.name) || '-';
  const inisial = String(nama).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  pasangGayaMini();
  /* Bentuknya menyalin sidebar modul Reservasi: merek + garis, seksi berlabel,
     baris menu 10px/12px dengan ikon selebar 20px, dan blok pengguna di kaki.
     Warna diambil dari variabel CSS halaman (--gold, --line, …) supaya satu
     perubahan tema Reservasi cukup disamakan di satu tempat. */
  document.getElementById('app-sidebar').innerHTML = `
    <div class="nav-brand flex items-center gap-3 px-4 pt-4 pb-3" style="border-bottom:1px solid var(--line)">
      <img src="../../assets/laksamanamuda-warna.jpg" alt="" class="w-9 h-9 rounded-lg object-contain flex-none">
      <div class="nav-brand-txt flex-1 min-w-0">
        <div class="f-head text-[16px] font-bold leading-none">Laksamana Muda</div>
        <div class="text-[9.5px] font-semibold mt-1 uppercase" style="letter-spacing:2.5px;color:var(--gold)">Stock</div>
      </div>
      <button type="button" onclick="toggleNav()" title="Sembunyikan / tampilkan menu" aria-label="Sembunyikan menu"
        class="nav-mini-btn btn-icon ml-auto">
        <i class="fa-solid fa-bars text-[12px]"></i>
      </button>
    </div>
    <nav class="flex-1 overflow-y-auto px-3 py-2">
      <div class="nav-sec-lbl text-[10.5px] font-bold uppercase px-3 pt-3 pb-2"
           style="letter-spacing:1.2px;color:var(--muted-2)">Pencatatan</div>
      ${tampilkanMenuModul ? menu.map(m => `
        <a href="${m.href}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium text-left mb-0.5 transition-all ${
          m.k === aktif ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}">
          <i class="fa-solid ${m.ico} w-5 text-center text-[16px]"></i> <span class="nav-lbl">${m.label}</span>
        </a>`).join('') : ''}
      ${views.map((v, i) => `
        <button type="button" data-nav-tampilan="${esc(v.v)}" onclick="gantiTampilan('${esc(v.v)}')"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium text-left mb-0.5 transition-all ${
          i === 0 ? 'bg-indigo-50 text-indigo-700 nav-on' : 'text-slate-500 hover:bg-slate-100'}">
          <i class="fa-solid ${v.ico} w-5 text-center text-[16px]"></i> <span class="nav-lbl">${esc(v.label)}</span>
        </button>`).join('')}
    </nav>
    <div class="nav-user-row p-3 flex items-center gap-2.5" style="border-top:1px solid var(--line)">
      <div class="w-9 h-9 rounded-[10px] text-white flex items-center justify-center font-bold text-[13px] flex-none"
           style="background:var(--gold)">${esc(inisial || '?')}</div>
      <div class="nav-user-txt min-w-0 flex-1">
        <div class="text-[13.5px] font-semibold truncate" style="color:var(--ink)">${esc(nama)}</div>
        <div class="text-[11px] truncate" style="color:var(--muted)">Kru Stock</div>
      </div>
      <a href="../../" title="Kembali ke Office" class="btn-icon dgr flex-none"><i class="fa-solid fa-power-off text-[13px]"></i></a>
    </div>`;
  // Terapkan preferensi ciut yang tersimpan.
  try{ if(localStorage.getItem('lm_stock_navmini')==='1') document.getElementById('app-sidebar').classList.add('nav-mini'); }catch(e){}

  document.getElementById('page-head').innerHTML = `
    <div>
      <h2 class="text-[25px] font-bold">${esc(judul)}</h2>
      <p class="text-[13.5px] mt-0.5" style="color:var(--muted)">${esc(deskripsi)}</p>
    </div>`;

  // Tab mini untuk HP — sidebar tersembunyi di bawah md.
  document.getElementById('mobile-tabs').innerHTML =
    (tampilkanMenuModul ? menu.map(m => `
      <a href="${m.href}" class="shrink-0 px-3 py-1.5 text-[11.5px] font-semibold rounded-md whitespace-nowrap flex items-center gap-1.5 ${
        m.k === aktif ? 'bg-white text-indigo-600' : 'text-slate-500'}">
        <i class="fa-solid ${m.ico} text-[10px]"></i>${m.label}</a>`).join('') : '') +
    views.map((v, i) => `
      <button type="button" data-tab-tampilan="${esc(v.v)}" onclick="gantiTampilan('${esc(v.v)}')"
        class="shrink-0 px-3 py-1.5 text-[11.5px] font-semibold rounded-md whitespace-nowrap flex items-center gap-1.5 ${
        i === 0 ? 'bg-white text-indigo-600' : 'text-slate-500'}">
        <i class="fa-solid ${v.ico} text-[10px]"></i>${esc(v.label)}</button>`).join('');

  // Tampilan pertama yang aktif saat halaman dibuka.
  if (views.length) gantiTampilan(views[0].v);
}

/* Tukar bagian halaman yang terlihat. Bagian ditandai data-tampilan="<v>";
   yang tidak cocok disembunyikan, BUKAN dibuang — isian form yang sedang
   diketik harus selamat saat orang menengok daftar lalu kembali. */
function gantiTampilan(v) {
  document.querySelectorAll('[data-tampilan]').forEach(el =>
    el.classList.toggle('hidden', el.dataset.tampilan !== v));

  document.querySelectorAll('[data-nav-tampilan]').forEach(b => {
    const on = b.dataset.navTampilan === v;
    b.classList.toggle('bg-indigo-50', on);
    b.classList.toggle('text-indigo-700', on);
    b.classList.toggle('text-slate-500', !on);
    b.classList.toggle('hover:bg-slate-100', !on);
    /* Penanda yang dipakai CSS halaman untuk menggambar rel emas di sisi kiri
       menu aktif — ciri sidebar modul Reservasi. Dipisah dari kelas warna
       Tailwind di atas karena pseudo-element tidak bisa dipasang lewat
       utility class. */
    b.classList.toggle('nav-on', on);
  });
  document.querySelectorAll('[data-tab-tampilan]').forEach(b => {
    const on = b.dataset.tabTampilan === v;
    b.classList.toggle('bg-white', on);
    b.classList.toggle('text-indigo-600', on);
    b.classList.toggle('text-slate-500', !on);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------ BERKAS */

/* Foto dikecilkan SEBELUM dikirim. Foto kamera HP bisa 3-5MB; disimpan apa
   adanya, tabel waste akan membengkak dan daftarnya jadi lambat untuk
   semua orang. 1280px sisi terpanjang dengan mutu 0.72 sudah lebih dari
   cukup untuk membuktikan barang apa yang terbuang. */
function fotoKeData(file, cb) {
  if (!file) return cb('');
  if (!/^image\//.test(file.type || '')) { toast('Bukan gambar', 'Pilih berkas foto (jpg/png).', 'err'); return; }
  if (file.size > 12 * 1024 * 1024) { toast('Foto terlalu besar', 'Maksimal 12MB.', 'err'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maks = 1280;
      let { width: w, height: h } = img;
      if (w > maks || h > maks) {
        const r = Math.min(maks / w, maks / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(c.toDataURL('image/jpeg', 0.72));
    };
    // Gambar rusak/format tak terbaca: kirim apa adanya daripada gagal diam.
    img.onerror = () => cb(e.target.result);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
