/* ============================================================
   PENCOCOKAN DANA QRIS BRI — SUMBER TUNGGAL
   ------------------------------------------------------------
   Dipakai bersama oleh modul CASHIER dan panel FINANCE > KAS KECIL, lewat
   menu bernama sama di kedua modul: "Pencocokan QRIS BRI".

   KENAPA ASET, BUKAN DISALIN KE DUA MODUL. Isinya rumus pencocokan uang —
   mutasi masuk rekening BRI dipasangkan ke DP reservasi. Dua salinan pasti
   menyimpang, dan yang menyimpang di sini membuat dua layar menyebut jumlah
   dana tercocokkan yang BERBEDA untuk bulan yang sama, tanpa satu pun galat.
   Repo ini sudah lima kali kehilangan waktu karena berkas kembar yang
   tertinggal (porsiPic, potonganHari, hpp.php, cocokPic, pengurai .xlsx).
   Pola yang sama dengan assets/performa-bonus.js dan assets/xlsx-baca.js.

   YANG DICOCOKKAN DP RESERVASI, dan itu DIUKUR bukan dikira. Dari berkas
   "Qris BRI 2026.xlsx" yang selama ini diisi tangan: September 2026 memuat
   155 baris berketerangan "Reservasi" dari 160, Agustus 245 dari 253.
   Sisanya segelintir event corporate, sewa videotron, dan setoran tamu —
   dan TIDAK ADA satu pun baris tiket. Itu sebabnya lawan cocoknya dps[]
   milik modul Reservasi.

   DIMUAT SEBELUM skrip modul:
     <script src="../assets/xlsx-baca.js"></script>
     <script src="../assets/cocok-bri.js"></script>
   Ketiadaannya WAJIB DIKATAKAN tuan rumah — mesin yang diam-diam tidak ada
   membuat halamannya kosong tanpa sebab, dan yang membukanya melaporkannya
   sebagai data hilang.

   MANDIRI. Pemformat & escape-nya sendiri (CB_RP / CB_NUM / CB_ESC), karena
   modul Cashier dan panel Kas Kecil menamainya berbeda-beda dan aset yang
   menumpang nama global tuan rumah akan memformat BERBEDA di tiap modul
   tanpa satu pun galat. Yang disalin hanya pemformat — tidak satu pun rumus.

   SELURUH ISINYA DI DALAM SATU IIFE. Nama seperti `num` dan `esc` bernama
   sama dengan milik tuan rumah, dan dua const bernama sama di lingkup global
   skrip klasik menjatuhkan halaman dengan SyntaxError SEBELUM satu baris pun
   jalan. Sudah kejadian saat performa-bonus.js lahir.
   ============================================================ */
(function (G) {
  'use strict';

  /* ============ PEMFORMAT & ALAT KECIL ============ */
  const CB_NUM = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const s = String(v == null ? '' : v).replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    /* Pemisah desimalnya yang MUNCUL PALING BELAKANG, jadi "1.234,56"
       (Indonesia) maupun "1,234.56" (Inggris) sama-sama benar. parseFloat
       apa adanya berhenti di titik KEDUA: "4.167.925" terbaca 4,167 —
       seribu kali lebih kecil, dan angkanya tetap terlihat wajar. Jebakan
       yang sama sudah dibayar di baris total Promotion Report. */
    const t = s.lastIndexOf('.'), k = s.lastIndexOf(',');
    let b = s;
    if (t >= 0 || k >= 0) {
      const p = Math.max(t, k);
      b = s.slice(0, p).replace(/[.,]/g, '') + '.' + s.slice(p + 1).replace(/[.,]/g, '');
    }
    const n = parseFloat(b);
    return isFinite(n) ? n : 0;
  };
  const CB_RP = n => 'Rp' + Math.round(CB_NUM(n)).toLocaleString('id-ID');
  const CB_ESC = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const BLN_ID = { jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', jun: '06',
                   jul: '07', agu: '08', aug: '08', sep: '09', okt: '10', oct: '10',
                   nov: '11', des: '12', dec: '12' };
  const NAMA_BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /* Serial Excel -> ISO, dihitung UTC. Dibaca lokal, zona di timur menggeser
     tanggalnya satu hari — dan tanggal yang bergeser satu hari di layar
     rekonsiliasi membuat mutasi jatuh ke hari yang salah tanpa satu pun
     galat. Aturan yang sama dengan isoDari() di modul Analytics. */
  function cbSerialISO(n) {
    const ms = Math.round((n - 25569) * 86400000);
    const d = new Date(ms);
    if (!isFinite(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  /* SATU pembaca untuk EMPAT bentuk tanggal yang benar-benar ada di berkas
     ini: serial Excel (46266), ISO, "02 Sept 2026", dan "2/9/2026".
     Rentang serial dijepit 20000..80000 supaya nomor meja atau nominal yang
     nyasar ke kolom tanggal tidak diam-diam jadi tanggal tahun 1900-an. */
  G.cbTgl = function (v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      return (n > 20000 && n < 80000) ? cbSerialISO(n) : '';
    }
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
    if (m) {
      const b = BLN_ID[m[2].slice(0, 3).toLowerCase()];
      if (b) return m[3] + '-' + b + '-' + String(m[1]).padStart(2, '0');
    }
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    return '';
  };
  G.cbTglID = function (iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    return String(+m[3]) + ' ' + NAMA_BLN[+m[2] - 1] + ' ' + m[1];
  };
  /* Jam dibakukan ke HH:MM — BERKAS KEMBAR bri_jam() di kompas-mysql. Kalau
     yang satu diubah yang lain HARUS ikut: sidik anti-unggah-ganda dibentuk
     dari jam yang sudah dibakukan, jadi dua aturan berarti unggah ulang
     melahirkan baris ganda untuk mutasi yang sama. */
  G.cbJam = function (v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2})[.:](\d{2})/);
    if (m) {
      const h = +m[1], i = +m[2];
      if (h >= 0 && h < 24 && i >= 0 && i < 60)
        return String(h).padStart(2, '0') + ':' + String(i).padStart(2, '0');
    }
    if (/^\d*\.?\d+$/.test(s)) {
      const f = parseFloat(s);
      /* Dijepit < 1: angka >= 1 adalah serial TANGGAL, dan membacanya
         sebagai jam memberi jam karangan yang tetap terlihat wajar. */
      if (f > 0 && f < 1) {
        const det = Math.round(f * 86400);
        return String(Math.floor(det / 3600) % 24).padStart(2, '0') + ':' +
               String(Math.floor((det % 3600) / 60)).padStart(2, '0');
      }
    }
    return '';
  };

  /* ============ MEMBACA LEMBAR MUTASI ============
     KOLOM DICARI MENURUT NAMANYA, bukan posisinya. Berkas ini disusun
     tangan dan kolomnya rutin digeser antar bulan; pembaca yang menghitung
     kolom ke-5 akan membaca "BCA" sebagai nominal BRI — salah yang muncul
     sebagai uang, bukan sebagai galat.

     COCOK PERSIS DULU, baru awalan. Tanpa itu 'bri' cocok ke mana-mana dan
     'tanggal' menelan 'tanggal booking'. */
  const KOL_CARI = {
    tgl:     ['tanggal bayar', 'tgl bayar', 'tanggal transaksi', 'tanggal', 'tgl'],
    jam:     ['jam', 'waktu', 'pukul'],
    ket:     ['keterangan', 'ket', 'berita', 'nama'],
    booking: ['tanggal booking', 'tgl booking', 'booking'],
    nominal: ['bri', 'qris bri', 'nominal', 'jumlah', 'kredit', 'masuk', 'amount'],
    settle:  ['setlement bank', 'settlement bank', 'setlement', 'settlement']
  };
  const rapi = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

  function petaKolom(kepala) {
    const peta = {}, dipakai = {};
    for (const bidang of Object.keys(KOL_CARI)) {
      let ketemu = '';
      for (const cari of KOL_CARI[bidang]) {
        for (const k of Object.keys(kepala)) {
          if (dipakai[k]) continue;
          if (rapi(kepala[k]) === cari) { ketemu = k; break; }
        }
        if (ketemu) break;
      }
      if (!ketemu) {
        for (const cari of KOL_CARI[bidang]) {
          for (const k of Object.keys(kepala)) {
            if (dipakai[k]) continue;
            if (rapi(kepala[k]).indexOf(cari) === 0) { ketemu = k; break; }
          }
          if (ketemu) break;
        }
      }
      if (ketemu) { peta[bidang] = ketemu; dipakai[ketemu] = true; }
    }
    return peta;
  }

  /* BARIS KEPALA DICARI, bukan dianggap baris pertama: lembar ini punya
     baris judul & baris Total di atas kepalanya (di berkas aslinya kepala
     ada di baris 2, dan baris 4 berisi Total). Yang dipakai baris pertama
     yang menghasilkan peta berisi tanggal DAN nominal — dua kolom yang
     tanpanya lembar itu memang tidak bisa dibaca sama sekali. */
  G.cbCariKepala = function (baris) {
    const batas = Math.min(baris.length, 30);
    for (let i = 0; i < batas; i++) {
      const p = petaKolom(baris[i] || {});
      if (p.tgl && p.nominal) return { baris: i, peta: p };
    }
    return null;
  };

  /* Lembar -> daftar mutasi siap kirim. Baris tanpa tanggal ATAU tanpa
     nominal dilewati dan JUMLAHNYA dilaporkan — lembar ini penuh baris
     kosong, baris Total, dan baris judul, dan menolak seluruh unggahan
     karenanya berarti berkas yang isinya benar tidak pernah bisa masuk.

     Baris TOTAL sengaja ikut terbuang lewat aturan yang sama: ia tidak
     punya tanggal. Kalau suatu hari berkasnya menulis tanggal di baris
     total, ia akan masuk sebagai mutasi raksasa — dan itu ketahuan di
     pratinjau sebelum tersimpan, bukan sesudahnya. */
  G.cbUraiLembar = function (baris) {
    const k = G.cbCariKepala(baris);
    if (!k) return { ok: false, error: 'Lembar ini tidak punya kolom tanggal dan nominal yang bisa dikenali. '
      + 'Kepala kolomnya dicari menurut NAMA (mis. "Tanggal Bayar" dan "BRI") — periksa lagi lembar yang dipilih.' };
    const p = k.peta, out = [], lewat = [];
    for (let i = k.baris + 1; i < baris.length; i++) {
      const b = baris[i] || {};
      const tgl = G.cbTgl(p.tgl ? b[p.tgl] : '');
      const nom = CB_NUM(p.nominal ? b[p.nominal] : 0);
      if (!tgl || !(nom > 0)) { if (tgl || nom) lewat.push(i + 1); continue; }
      out.push({
        tgl: tgl,
        jam: G.cbJam(p.jam ? b[p.jam] : ''),
        nominal: Math.round(nom),
        ket: String((p.ket ? b[p.ket] : '') || '').trim(),
        booking: G.cbTgl(p.booking ? b[p.booking] : ''),
        settle: G.cbTgl(p.settle ? b[p.settle] : '')
      });
    }
    return { ok: true, baris: out, lewat: lewat.length, peta: p, barisKepala: k.baris + 1 };
  };

  /* ============ PENCOCOKAN ============ */
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  /* Nama tamu diambil SESUDAH titik dua: keterangan di lembar ini berbentuk
     "Reservasi : Arlanda", "Nobar : Zhafira", "Ibot : VM". Yang tanpa titik
     dua dipakai utuh — "PT. Ibra Harisindo" memang nama pemesannya. */
  G.cbNamaDari = function (ket) {
    const s = String(ket || '').trim();
    const i = s.indexOf(':');
    return (i >= 0 ? s.slice(i + 1) : s).trim();
  };
  /* Nama PENDEK wajib SAMA PERSIS, yang panjang boleh sebagian. "Ika" akan
     cocok ke Rika, Ikang, dan Marika kalau dibiarkan sebagai substring, dan
     pencocokan yang salah di sini memindahkan uang orang ke reservasi orang
     lain. Empat huruf adalah batas terpendek yang masih menyisakan nama
     seperti "Nur" sebagai pencocokan persis. */
  G.cbNamaCocok = function (a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x.length < 4 || y.length < 4) return x === y;
    return x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
  };

  /* EMPAT BABAK, DISAPU GLOBAL — bukan baris demi baris.
     -------------------------------------------------------------------
     Pencocokan serakah (tiap baris mengambil kandidat pertama yang cocok
     dengan aturan apa pun) SALAH, dan salahnya halus: baris ke-19 yang cuma
     cocok lewat tanggal+nominal akan MENGAMBIL DP milik baris ke-20 yang
     sebenarnya cocok sampai ke namanya. Diuji atas data produksi September
     2026 — cara serakah meleset pada Fenty, Linda, Caca, dan Winanto,
     seluruhnya reservasi yang datanya JELAS ada.

     Jadi babak 1 menyapu SELURUH baris lebih dulu, baru babak 2, dan
     seterusnya. Hasilnya 141 dari 165 baris (85%) tercocokkan sendiri.

     DUA BABAK PERTAMA "PASTI" (nominal + nama + salah satu tanggalnya
     cocok) — itu yang boleh diterapkan sekaligus. Dua babak terakhir
     "KIRA-KIRA" dan wajib ditekan satu per satu: babak 3 tidak punya
     tanggal yang menguatkan, dan babak 4 tidak punya nama sama sekali. */
  const BABAK = [
    { kode: 'nama-tgl',  pasti: true,  teks: 'nama, tanggal bayar, dan nominalnya cocok',
      uji: (m, d) => d.tfTgl === m.tgl && d.nominal === m.nominal && G.cbNamaCocok(d.nama, G.cbNamaDari(m.ket)) },
    { kode: 'nama-book', pasti: true,  teks: 'nama, tanggal booking, dan nominalnya cocok',
      uji: (m, d) => d.nominal === m.nominal && G.cbNamaCocok(d.nama, G.cbNamaDari(m.ket))
                     && !!m.booking && d.resTgl === m.booking },
    { kode: 'nama',      pasti: false, teks: 'nama & nominalnya cocok, tapi tanggalnya tidak menguatkan',
      uji: (m, d) => d.nominal === m.nominal && G.cbNamaCocok(d.nama, G.cbNamaDari(m.ket)) },
    { kode: 'tgl',       pasti: false, teks: 'tanggal & nominalnya cocok, tapi mutasinya tidak berketerangan',
      uji: (m, d) => !G.cbNamaDari(m.ket) && d.tfTgl === m.tgl && d.nominal === m.nominal }
  ];

  /* Memulangkan peta idMutasi -> {dp, babak}. TIDAK menyentuh data apa pun:
     ini USULAN, dan pencocokan adalah keputusan tentang uang — menuliskannya
     ke database tanpa ada yang menekan apa pun berarti mengambil keputusan
     itu atas nama orang yang belum melihatnya. */
  G.cbUsulan = function (mutasi, dps) {
    const bebasDp = dps.filter(d => !d.dipakai);
    const pakai = {}, hasil = {};
    for (const bb of BABAK) {
      for (const m of mutasi) {
        if (hasil[m.id]) continue;
        const d = bebasDp.find(x => !pakai[x.dpId] && bb.uji(m, x));
        if (d) { pakai[d.dpId] = true; hasil[m.id] = { dp: d, babak: bb }; }
      }
    }
    return hasil;
  };

  /* ============ STATE ============
     HIDUP DI LUAR DOM. Render di kedua tuan rumah TOTAL — halaman digambar
     ulang dari string HTML tiap kali apa pun berubah — jadi apa pun yang
     cuma ada di kotak isian ikut hilang, termasuk kata kunci pencarian dan
     tempelan yang belum disimpan. Pola QA.cat di lembar pembayaran Brankas. */
  const CB = {
    opsi: null,
    ym: '',            // bulan yang sedang dimuat (YYYY-MM)
    muat: '',          // bulan yang permintaannya sudah berangkat
    rows: [], total: 0, maks: 0, err: '',
    dps: null, dpErr: '', dpMuat: false,   // DP dari modul Reservasi
    cari: '', tapis: 'belum',
    buka: '',          // id baris yang panel cocoknya terbuka
    cariDp: '',        // pencarian di dalam panel itu
    tempel: '', lembar: null, lembarPilih: 0, pratinjau: null, bacaErr: '',
    sibuk: false, pesan: ''
  };

  /* ============ PEMUAT ============ */
  function post(payload) {
    const s = CB.opsi.sesi() || {};
    return fetch(CB.opsi.apiUrl, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ sesi: s.token || '' }, payload))
    }).then(r => r.json());
  }
  function rentang(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) { const t = new Date(); ym = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); }
    const [y, b] = ym.split('-').map(Number);
    const akhir = new Date(Date.UTC(y, b, 0)).getUTCDate();
    return { dari: ym + '-01', sampai: ym + '-' + String(akhir).padStart(2, '0') };
  }

  /* Ditandai SEBELUM permintaan berangkat. Pemuat ini menggambar ulang di
     ujungnya dan penggambaran itulah yang memicunya — tanpa penanda, keduanya
     saling memanggil tanpa henti dan yang terlihat bukan galat melainkan
     halaman berkedip sambil menghujani server. Bulan yang GAGAL ikut ditandai
     supaya kegagalan tidak dicoba ulang selamanya; yang mencoba ulang tombol
     di pesan galatnya. Pelajaran muatVoid() & muatReqMkt(). */
  async function muatMutasi(ym) {
    CB.muat = ym; CB.ym = ym;
    const r = rentang(ym);
    try {
      const j = await fetch(CB.opsi.apiUrl + '?action=briList&dari=' + r.dari + '&sampai=' + r.sampai
                            + '&t=' + Date.now(), { method: 'GET', redirect: 'follow' }).then(x => x.json());
      if (!j || !j.ok) throw new Error((j && j.error) || 'server error');
      CB.rows = (j.data && j.data.baris) || [];
      CB.total = (j.data && j.data.total) || 0;
      CB.maks = (j.data && j.data.maks) || 0;
      CB.err = '';
    } catch (e) { CB.rows = []; CB.err = (e && e.message) || String(e); }
    CB.opsi.gambarUlang();
  }

  /* DP DARI MODUL RESERVASI, lewat getAll yang memang sudah terbuka — TIDAK
     ada endpoint baru di sana. Backend Reservasi diunggah manual dan bukan
     milik repo ini; menambah aksi di sana berarti satu langkah pemasangan
     yang bisa tertinggal, dan gejalanya halaman ini kosong di satu server
     sementara benar di server sebelahnya.

     DIMUAT SEKALI PER SESI HALAMAN, bukan tiap ganti bulan: balasannya ~2,4
     MB dan isinya seluruh reservasi, jadi menariknya ulang tiap klik bulan
     membuat halaman ini terasa rusak di jaringan yang biasa. Tombol Muat
     Ulang yang menyegarkannya. */
  async function muatDp() {
    if (CB.dpMuat) return;
    CB.dpMuat = true;
    try {
      const j = await fetch(CB.opsi.rsvUrl + '?action=getAll&t=' + Date.now(),
                            { method: 'GET', redirect: 'follow' }).then(x => x.json());
      if (!j || !j.ok) throw new Error((j && j.error) || 'server error');
      const res = (j.data && j.data.reservations) || [];
      const out = [];
      for (const r of res) {
        const ds = Array.isArray(r.dps) ? r.dps : [];
        for (const p of ds) {
          /* tfAmount = nominal hasil baca bukti transfer, amount = yang
             diketik kru. Yang dipakai tfAmount SELAMA ada: itu angka yang
             benar-benar tertulis di struk, dan justru struk itulah yang
             dicocokkan ke mutasi bank. */
          const n = CB_NUM(p.tfAmount) > 0 ? CB_NUM(p.tfAmount) : CB_NUM(p.amount);
          out.push({
            resId: String(r.id || ''), dpId: String(p.id || ''),
            nama: String(r.name || ''), resTgl: String(r.date || ''),
            tfTgl: String(p.tfDate || ''), tfJam: String(p.tfTime || ''),
            bank: String(p.tfBank || ''), metode: String(p.method || ''),
            status: String(p.tfStatus || ''), nominal: Math.round(n)
          });
        }
      }
      CB.dps = out; CB.dpErr = '';
    } catch (e) { CB.dps = []; CB.dpErr = (e && e.message) || String(e); }
    CB.opsi.gambarUlang();
  }

  /* ============ TURUNAN ============ */
  const hidup = r => !(r.batalAt > 0);
  const sudah = r => hidup(r) && r.cara === 'cocok';
  const bukan = r => hidup(r) && r.cara === 'bukan';
  const belum = r => hidup(r) && r.cara !== 'cocok' && r.cara !== 'bukan';
  const jml = a => a.reduce((x, r) => x + CB_NUM(r.nominal), 0);

  /* DP yang sudah dipegang baris mutasi mana pun di bulan yang sedang
     dibuka. Dipakai dua tempat — usulan dan daftar kandidat — supaya satu
     DP tidak pernah ditawarkan dua kali. Penjaga sungguhannya tetap di
     server (bri_dp_dipakai): layar bisa saja memegang daftar yang sudah
     basi, dan dua orang yang mencocokkan bersamaan hanya ketahuan di sana. */
  function dpTerpakai() {
    const p = {};
    for (const r of CB.rows) if (sudah(r) && r.dpId) p[r.dpId] = r;
    return p;
  }
  function dpsBulan() {
    if (!CB.dps) return [];
    const pakai = dpTerpakai();
    const r = rentang(CB.ym);
    return CB.dps
      /* Disaring ke bulan yang sedang dibuka lewat tanggal transfer ATAU
         tanggal reservasinya. Dijepit ke tanggal transfer saja, DP yang
         tfDate-nya kosong — 197 dari 478 di produksi, karena OCR strukhnya
         gagal membaca tanggal — tidak akan pernah bisa dipilih siapa pun. */
      .filter(d => (d.tfTgl >= r.dari && d.tfTgl <= r.sampai)
                || (d.resTgl >= r.dari && d.resTgl <= r.sampai) || !d.tfTgl)
      .map(d => Object.assign({}, d, { dipakai: !!pakai[d.dpId] }));
  }

  /* ============ GAMBAR ============ */
  function stat(lab, val, sub, kelas) {
    return '<div class="cb-stat' + (kelas ? ' ' + kelas : '') + '">'
      + '<div class="cb-lab">' + CB_ESC(lab) + '</div>'
      + '<div class="cb-val">' + CB_ESC(val) + '</div>'
      + (sub ? '<div class="cb-foot">' + sub + '</div>' : '') + '</div>';
  }
  function pita(jenis, isi) { return '<div class="cb-notice ' + jenis + '">' + isi + '</div>'; }

  function kartuRingkas() {
    const h = CB.rows.filter(hidup), s = h.filter(sudah), b = h.filter(belum), k = h.filter(bukan);
    const batal = CB.rows.filter(r => !hidup(r));
    return '<div class="cb-grid4">'
      + stat('Dana Masuk BRI', CB_RP(jml(h)), h.length + ' baris mutasi'
          + (batal.length ? ' &middot; ' + batal.length + ' dibatalkan, tidak dihitung' : ''))
      + stat('Sudah Dicocokkan', CB_RP(jml(s)), s.length + ' baris &rarr; DP reservasi', 'ok')
      + stat('Belum Dicocokkan', CB_RP(jml(b)), b.length + ' baris menunggu diperiksa', b.length ? 'warn' : '')
      + stat('Bukan DP Reservasi', CB_RP(jml(k)), k.length + ' baris, sebabnya dicatat')
      + '</div>';
  }

  function kartuSumber() {
    const bisa = CB.opsi.bolehUbah();
    let isi = '<div class="cb-card"><h3>Sumber Data Mutasi</h3>'
      + '<div class="cb-sub">Baris mutasi masuk rekening BRI untuk bulan yang sedang dipilih. '
      + 'Diunggah dari berkas rekap QRIS BRI (.xlsx/.csv) atau ditempel dari Excel. '
      + '<b>Unggah ulang tidak pernah menghapus pencocokan yang sudah diputuskan</b> &mdash; '
      + 'yang diperbarui cuma keterangan, tanggal booking, dan tanggal settlement.</div>';
    if (!bisa) {
      isi += pita('info', 'Kamu bisa <b>melihat</b> halaman ini, tapi tidak mengubahnya. '
        + 'Minta admin modul menaikkan aksesmu jadi <b>Boleh Ubah</b> kalau perlu mengunggah atau mencocokkan.');
      return isi + '</div>';
    }
    isi += '<div class="cb-baris-alat">'
      + '<label class="cb-btn cb-btn-utama">&#8593; Unggah berkas'
      + '<input type="file" accept=".xlsx,.csv" style="display:none" onchange="cbPilihBerkas(this)"></label>'
      + (CB.rows.length ? '<button class="cb-btn" onclick="cbSegarkan()">&#8635; Muat ulang</button>' : '')
      + '</div>'
      + '<details class="cb-det"><summary>&hellip; atau tempel dari Excel</summary>'
      + '<div class="cb-sub">Salin baris-barisnya dari Excel (berikut baris kepala kolomnya) lalu tempel di sini. '
      + 'Aturan membacanya SAMA dengan jalur berkas &mdash; satu pengurai, dua cara memasukkan.</div>'
      + '<textarea class="cb-ta" rows="6" placeholder="Tanggal Bayar\tJam\tKeterangan\tTanggal booking\tBRI&#10;02 Sept 2026\t11.44\tReservasi : Arlanda\t02 Sept 2026\t200000"'
      + ' oninput="cbKetikTempel(this)">' + CB_ESC(CB.tempel) + '</textarea>'
      + '<button class="cb-btn" onclick="cbBacaTempel()">Baca tempelan</button>'
      + '</details>';

    if (CB.bacaErr) isi += pita('bad', CB_ESC(CB.bacaErr));
    if (CB.lembar && CB.lembar.length > 1) {
      isi += '<div class="cb-sub" style="margin-top:10px"><b>Berkasnya punya ' + CB.lembar.length
        + ' lembar.</b> Pilih lembar bulan yang mau diunggah &mdash; lembar pertama belum tentu bulan ini.</div>'
        + '<div class="cb-seg">' + CB.lembar.map((s, i) =>
            '<button class="' + (i === CB.lembarPilih ? 'on active' : '') + '" onclick="cbPilihLembar(' + i + ')">'
            + CB_ESC(s.nama) + '</button>').join('') + '</div>';
    }
    if (CB.pratinjau) isi += pratinjauHtml();
    return isi + '</div>';
  }

  function pratinjauHtml() {
    const p = CB.pratinjau;
    if (!p.ok) return pita('bad', CB_ESC(p.error));
    const n = p.baris.length;
    const total = p.baris.reduce((a, b) => a + b.nominal, 0);
    /* Bulan yang dominan di tempelannya DISEBUT, dan dibandingkan dengan
       bulan yang sedang dibuka. Lembar yang salah pilih adalah kesalahan
       paling mudah di halaman ini, dan tanpa peringatan ini akibatnya baru
       ketahuan sesudah sebulan mutasi masuk ke bulan yang keliru. */
    const hit = {};
    p.baris.forEach(b => { const k = b.tgl.slice(0, 7); hit[k] = (hit[k] || 0) + 1; });
    const urut = Object.keys(hit).sort((a, b) => hit[b] - hit[a]);
    const dom = urut[0] || '';
    let isi = '<div class="cb-pra"><b>Siap diunggah: ' + n + ' baris, ' + CB_RP(total) + '</b>'
      + (p.lewat ? ' <span class="cb-muted">&middot; ' + p.lewat + ' baris dilewati (tanpa tanggal atau tanpa nominal)</span>' : '')
      + '<div class="cb-sub">Kepala kolom terbaca di baris ' + p.barisKepala + '. '
      + 'Kolom yang dikenali: ' + Object.keys(p.peta).map(k => '<code>' + CB_ESC(k) + '</code>&rarr;' + CB_ESC(p.peta[k])).join(', ')
      + '</div>';
    if (dom && dom !== CB.ym) {
      isi += pita('warn', 'Isi lembar ini kebanyakan bulan <b>' + CB_ESC(dom) + '</b>, sementara halaman ini sedang membuka <b>'
        + CB_ESC(CB.ym) + '</b>. Barisnya tetap tersimpan menurut tanggalnya masing-masing, '
        + 'tapi baru akan kelihatan kalau bulannya dipindah.');
    }
    isi += '<div class="cb-tbl-wrap"><table class="cb-tbl"><thead><tr>'
      + '<th>Tanggal</th><th>Jam</th><th class="num">Nominal</th><th>Keterangan</th><th>Booking</th>'
      + '</tr></thead><tbody>'
      + p.baris.slice(0, 8).map(b => '<tr><td>' + CB_ESC(G.cbTglID(b.tgl)) + '</td><td>' + CB_ESC(b.jam || '—')
          + '</td><td class="num">' + CB_RP(b.nominal) + '</td><td>' + CB_ESC(b.ket || '—')
          + '</td><td>' + CB_ESC(b.booking ? G.cbTglID(b.booking) : '—') + '</td></tr>').join('')
      + '</tbody></table></div>'
      + (n > 8 ? '<div class="cb-sub">&hellip; dan ' + (n - 8) + ' baris lagi.</div>' : '')
      + '<div class="cb-baris-alat"><button class="cb-btn cb-btn-utama" ' + (CB.sibuk ? 'disabled' : '')
      + ' onclick="cbSimpanUnggah()">' + (CB.sibuk ? 'Menyimpan&hellip;' : 'Simpan ' + n + ' baris ke server') + '</button>'
      + '<button class="cb-btn" onclick="cbBatalPratinjau()">Batal</button></div></div>';
    return isi;
  }

  function kartuUsulan() {
    if (!CB.opsi.bolehUbah()) return '';
    if (!CB.dps) return '';
    const b = CB.rows.filter(belum);
    if (!b.length) return '';
    const us = G.cbUsulan(b, dpsBulan());
    const ids = Object.keys(us);
    if (!ids.length) return '';
    const pasti = ids.filter(i => us[i].babak.pasti);
    let isi = '<div class="cb-card"><h3>Usulan Pencocokan</h3>'
      + '<div class="cb-sub">Dihitung di layar dari DP yang tercatat di modul Reservasi. '
      + '<b>Belum ada satu pun yang tersimpan</b> &mdash; pencocokan adalah keputusan tentang uang, '
      + 'jadi ia baru tercatat kalau ada yang menekannya.</div>';
    if (pasti.length) {
      isi += pita('ok', '<b>' + pasti.length + ' usulan pasti</b> &mdash; nominalnya cocok DAN namanya cocok DAN '
        + 'salah satu tanggalnya cocok. '
        + '<button class="cb-btn cb-btn-utama" style="margin-left:8px" ' + (CB.sibuk ? 'disabled' : '')
        + ' onclick="cbTerapkanPasti()">' + (CB.sibuk ? 'Menyimpan&hellip;' : 'Terapkan ' + pasti.length + ' usulan') + '</button>');
    }
    const kira = ids.filter(i => !us[i].babak.pasti);
    if (kira.length) {
      isi += pita('warn', '<b>' + kira.length + ' usulan kira-kira</b> &mdash; ditawarkan di barisnya masing-masing '
        + 'dan harus ditekan satu per satu. Yang ini tidak punya tanggal atau tidak punya nama yang menguatkan, '
        + 'jadi menerapkannya sekaligus berarti memindahkan uang orang tanpa ada yang melihatnya.');
    }
    return isi + '</div>';
  }

  function chipCara(r) {
    if (!hidup(r)) return '<span class="cb-chip bad">dibatalkan</span>';
    if (r.cara === 'cocok') return '<span class="cb-chip ok">&#10003; cocok</span>';
    if (r.cara === 'bukan') return '<span class="cb-chip">bukan DP</span>';
    return '<span class="cb-chip warn">belum</span>';
  }

  function barisTerpilih() {
    const q = norm(CB.cari);
    return CB.rows.filter(r => {
      if (CB.tapis === 'belum' && !belum(r)) return false;
      if (CB.tapis === 'sudah' && !sudah(r)) return false;
      if (CB.tapis === 'bukan' && !bukan(r)) return false;
      if (CB.tapis === 'batal' && hidup(r)) return false;
      if (!q) return true;
      return norm(r.ket + ' ' + r.resNama + ' ' + r.catatan + ' ' + r.nominal + ' ' + r.tgl).indexOf(q) >= 0;
    });
  }

  function kartuTabel() {
    const h = CB.rows.filter(hidup);
    const n = { semua: CB.rows.length, belum: h.filter(belum).length,
                sudah: h.filter(sudah).length, bukan: h.filter(bukan).length,
                batal: CB.rows.filter(r => !hidup(r)).length };
    const list = barisTerpilih();
    const us = (CB.dps && CB.opsi.bolehUbah()) ? G.cbUsulan(CB.rows.filter(belum), dpsBulan()) : {};
    let isi = '<div class="cb-card"><h3>Mutasi Masuk BRI &mdash; ' + CB_ESC(labelBulan(CB.ym)) + '</h3>'
      + '<div class="cb-baris-alat">'
      + '<div class="cb-seg">'
      + [['belum', 'Belum cocok'], ['sudah', 'Sudah cocok'], ['bukan', 'Bukan DP'], ['batal', 'Dibatalkan'], ['semua', 'Semua']]
          .map(([k, t]) => '<button class="' + (CB.tapis === k ? 'on active' : '') + '" onclick="cbTapis(\'' + k + '\')">'
            + t + ' (' + n[k] + ')</button>').join('')
      + '</div>'
      + '<input class="cb-cari" placeholder="Cari nama, nominal, tanggal&hellip;" value="' + CB_ESC(CB.cari)
      + '" oninput="cbKetikCari(this)">'
      + '</div>';

    if (CB.err) {
      isi += pita('bad', 'Daftar mutasi tidak terbaca: <b>' + CB_ESC(CB.err) + '</b>. '
        + '<button class="cb-btn" onclick="cbSegarkan()">Coba lagi</button>');
    } else if (!CB.rows.length) {
      isi += '<div class="cb-kosong">Belum ada satu baris mutasi pun untuk bulan ini. '
        + 'Unggah berkas rekap QRIS BRI di kartu di atas.</div>';
    } else if (!list.length) {
      isi += '<div class="cb-kosong">Tidak ada baris yang cocok dengan saringan yang sedang berlaku'
        + (CB.cari ? ' dan kata kunci <b>' + CB_ESC(CB.cari) + '</b>' : '') + '.</div>';
    } else {
      isi += '<div class="cb-tbl-wrap"><table class="cb-tbl"><thead><tr>'
        + '<th>Tanggal</th><th>Jam</th><th class="num">Nominal</th><th>Keterangan</th>'
        + '<th>Status</th><th>Dicocokkan ke</th><th></th></tr></thead><tbody>';
      for (const r of list) isi += barisHtml(r, us[r.id]);
      isi += '</tbody></table></div>';
      if (CB.total > CB.rows.length) {
        isi += pita('warn', CB.total + ' baris ada di server untuk rentang ini, tapi cuma ' + CB.maks
          + ' yang ditampilkan. Sisanya belum tergambar di sini.');
      }
    }
    return isi + '</div>';
  }

  function barisHtml(r, usul) {
    const bisa = CB.opsi.bolehUbah();
    const terbuka = CB.buka === r.id;
    let tujuan = '<span class="cb-muted">&mdash;</span>';
    if (r.cara === 'cocok') {
      tujuan = '<b>' + CB_ESC(r.resNama || '(tanpa nama)') + '</b>'
        + (r.resTgl ? '<div class="cb-kecil">reservasi ' + CB_ESC(G.cbTglID(r.resTgl)) + '</div>' : '')
        + (r.cocokOleh ? '<div class="cb-kecil cb-muted">oleh ' + CB_ESC(r.cocokOleh) + '</div>' : '');
    } else if (r.cara === 'bukan') {
      tujuan = '<span class="cb-muted">' + CB_ESC(r.catatan || 'bukan DP reservasi') + '</span>'
        + (r.cocokOleh ? '<div class="cb-kecil cb-muted">oleh ' + CB_ESC(r.cocokOleh) + '</div>' : '');
    } else if (usul) {
      tujuan = '<span class="cb-usul">usul: <b>' + CB_ESC(usul.dp.nama) + '</b> &middot; '
        + CB_ESC(usul.babak.teks) + '</span>'
        + (bisa ? ' <button class="cb-btn cb-btn-xs" onclick="cbTerimaUsul(\'' + r.id + '\')">Terima</button>' : '');
    }
    let aksi = '';
    if (bisa && hidup(r)) {
      aksi = '<button class="cb-btn cb-btn-xs" onclick="cbBuka(\'' + r.id + '\')">'
        + (terbuka ? 'Tutup' : (r.cara ? 'Ubah' : 'Cocokkan')) + '</button>';
    }
    let html = '<tr class="' + (hidup(r) ? '' : 'cb-coret') + '">'
      + '<td>' + CB_ESC(G.cbTglID(r.tgl)) + '</td>'
      + '<td>' + CB_ESC(r.jam || '—') + '</td>'
      + '<td class="num"><b>' + CB_RP(r.nominal) + '</b></td>'
      + '<td>' + CB_ESC(r.ket || '') + (r.ket ? '' : '<span class="cb-muted">(tanpa keterangan)</span>')
      + (r.booking ? '<div class="cb-kecil cb-muted">booking ' + CB_ESC(G.cbTglID(r.booking)) + '</div>' : '') + '</td>'
      + '<td>' + chipCara(r) + '</td>'
      + '<td>' + tujuan + '</td>'
      + '<td class="cb-aksi">' + aksi + '</td></tr>';
    if (terbuka) html += '<tr class="cb-panel-baris"><td colspan="7">' + panelCocok(r) + '</td></tr>';
    return html;
  }

  /* PANEL INLINE, bukan modal. Dua tuan rumah menamai modalnya berbeda, dan
     aset yang memanggil modal tuan rumah akan bekerja di satu modul lalu
     melempar di modul sebelahnya. Panel yang digambar di dalam tabelnya
     sendiri tidak bergantung apa pun di luar aset ini. */
  function panelCocok(r) {
    if (!CB.dps) {
      return '<div class="cb-panel">' + pita('warn', 'Daftar DP dari modul Reservasi belum termuat. '
        + '<button class="cb-btn" onclick="cbMuatDp()">Muat sekarang</button>') + '</div>';
    }
    if (CB.dpErr) {
      return '<div class="cb-panel">' + pita('bad', 'Daftar DP tidak terbaca dari modul Reservasi: <b>'
        + CB_ESC(CB.dpErr) + '</b>. Selama itu belum beres, baris ini cuma bisa ditandai '
        + '<i>bukan DP reservasi</i>.') + '</div>';
    }
    const q = norm(CB.cariDp);
    let kandidat = dpsBulan().filter(d => !d.dipakai || d.dpId === r.dpId);
    if (q) kandidat = kandidat.filter(d => norm(d.nama + ' ' + d.nominal + ' ' + d.tfTgl + ' ' + d.resTgl).indexOf(q) >= 0);
    /* Diurutkan menurut KEDEKATAN, bukan abjad: yang nominalnya sama persis
       naik ke atas, lalu yang tanggalnya sama. Daftar berabjad memaksa orang
       menyisir 400 baris untuk kandidat yang sebenarnya cuma satu. */
    const skor = d => (d.nominal === CB_NUM(r.nominal) ? 4 : 0)
                    + (d.tfTgl === r.tgl ? 2 : 0)
                    + (G.cbNamaCocok(d.nama, G.cbNamaDari(r.ket)) ? 8 : 0)
                    + (r.booking && d.resTgl === r.booking ? 1 : 0);
    kandidat = kandidat.slice().sort((a, b) => skor(b) - skor(a)
      || String(a.nama).localeCompare(String(b.nama)));
    const tampil = kandidat.slice(0, 40);

    let isi = '<div class="cb-panel">'
      + '<div class="cb-panel-judul">Cocokkan <b>' + CB_RP(r.nominal) + '</b> &middot; '
      + CB_ESC(G.cbTglID(r.tgl)) + (r.jam ? ' ' + CB_ESC(r.jam) : '')
      + (r.ket ? ' &middot; ' + CB_ESC(r.ket) : '') + '</div>'
      + '<input class="cb-cari" placeholder="Cari DP: nama tamu, nominal, tanggal&hellip;" value="' + CB_ESC(CB.cariDp)
      + '" oninput="cbKetikCariDp(this)">';
    if (!tampil.length) {
      isi += '<div class="cb-kosong">Tidak ada DP yang cocok dengan pencarian itu. '
        + 'DP yang sudah dipegang baris mutasi lain sengaja tidak ditawarkan &mdash; lepas dulu pencocokannya di sana.</div>';
    } else {
      isi += '<div class="cb-tbl-wrap"><table class="cb-tbl cb-tbl-kecil"><tbody>';
      for (const d of tampil) {
        const sama = d.nominal === CB_NUM(r.nominal);
        isi += '<tr><td><b>' + CB_ESC(d.nama) + '</b>'
          + '<div class="cb-kecil cb-muted">reservasi ' + CB_ESC(G.cbTglID(d.resTgl) || '—')
          + (d.tfTgl ? ' &middot; transfer ' + CB_ESC(G.cbTglID(d.tfTgl)) : ' &middot; tanggal transfer tidak terbaca')
          + ' &middot; ' + CB_ESC(d.bank || d.metode || '—') + '</div></td>'
          + '<td class="num ' + (sama ? 'cb-pas' : 'cb-beda') + '">' + CB_RP(d.nominal)
          + (sama ? '' : '<div class="cb-kecil">beda ' + CB_RP(Math.abs(d.nominal - CB_NUM(r.nominal))) + '</div>') + '</td>'
          + '<td class="cb-aksi"><button class="cb-btn cb-btn-xs cb-btn-utama" onclick="cbPilihDp(\'' + r.id + '\',\''
          + CB_ESC(d.dpId) + '\')">Pilih</button></td></tr>';
      }
      isi += '</tbody></table></div>';
      if (kandidat.length > tampil.length)
        isi += '<div class="cb-sub">' + (kandidat.length - tampil.length) + ' DP lain tidak ditampilkan &mdash; persempit pencariannya.</div>';
    }
    isi += '<div class="cb-panel-kaki">'
      + '<button class="cb-btn" onclick="cbTandaiBukan(\'' + r.id + '\')">Uang ini bukan DP reservasi&hellip;</button>'
      + (r.cara ? '<button class="cb-btn" onclick="cbLepas(\'' + r.id + '\')">Lepas pencocokan</button>' : '')
      + '<button class="cb-btn cb-btn-bahaya" onclick="cbBatalBaris(\'' + r.id + '\')">Batalkan baris mutasi&hellip;</button>'
      + '</div></div>';
    return isi;
  }

  /* DP yang TIDAK punya pasangan di mutasi BRI. Arah sebaliknya, dan ia yang
     menangkap kesalahan yang tidak bisa dilihat dari tabel di atas: DP yang
     tercatat di Reservasi tapi uangnya tidak pernah masuk rekening BRI.

     SEBAGIAN BESAR MEMANG BUKAN KESALAHAN, dan itu dikatakan: DP bertanda
     Transfer UOB / BCA / Mandiri memang masuk rekening lain. Yang dicari di
     sini yang bertanda BRI atau QRIS. */
  function kartuDpYatim() {
    if (!CB.dps || CB.dpErr) return '';
    const pakai = dpTerpakai();
    const r = rentang(CB.ym);
    const yatim = CB.dps.filter(d => !pakai[d.dpId]
      && d.tfTgl >= r.dari && d.tfTgl <= r.sampai);
    if (!yatim.length) return '';
    const bri = yatim.filter(d => /bri|qris/i.test(d.bank + ' ' + d.metode));
    const lain = yatim.filter(d => !/bri|qris/i.test(d.bank + ' ' + d.metode));
    let isi = '<div class="cb-card"><h3>DP Reservasi yang Belum Ketemu di Mutasi BRI</h3>'
      + '<div class="cb-sub">Arah sebaliknya: DP yang tercatat di modul Reservasi bulan ini tapi belum '
      + 'dipasangkan ke satu baris mutasi pun. Dihitung dari tanggal transfernya.</div>';
    if (lain.length) {
      isi += pita('info', '<b>' + lain.length + ' di antaranya memang bukan BRI</b> (' + CB_RP(jml(lain))
        + ') &mdash; bertanda ' + CB_ESC([...new Set(lain.map(d => d.bank || d.metode))].slice(0, 6).join(', '))
        + '. Uangnya masuk rekening lain, jadi memang tidak akan pernah ada di daftar ini.');
    }
    if (!bri.length) return isi + '</div>';
    isi += '<div class="cb-tbl-wrap"><table class="cb-tbl"><thead><tr>'
      + '<th>Tgl transfer</th><th>Nama</th><th class="num">Nominal</th><th>Bank / metode</th><th>Reservasi</th>'
      + '</tr></thead><tbody>'
      + bri.slice(0, 40).map(d => '<tr><td>' + CB_ESC(G.cbTglID(d.tfTgl)) + '</td>'
          + '<td><b>' + CB_ESC(d.nama) + '</b></td>'
          + '<td class="num">' + CB_RP(d.nominal) + '</td>'
          + '<td>' + CB_ESC(d.bank || d.metode || '—') + '</td>'
          + '<td>' + CB_ESC(G.cbTglID(d.resTgl) || '—') + '</td></tr>').join('')
      + '</tbody></table></div>';
    if (bri.length > 40) isi += '<div class="cb-sub">&hellip; dan ' + (bri.length - 40) + ' lagi.</div>';
    return isi + '</div>';
  }

  function labelBulan(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return String(ym || '');
    return NAMA_BLN[+m[2] - 1] + ' ' + m[1];
  }

  /* ============ PINTU MASUK TUAN RUMAH ============ */
  G.cbPasang = function (opsi) { CB.opsi = opsi; };

  G.cbGambar = function (el, ym) {
    if (!CB.opsi) { el.innerHTML = '<div class="cb-card">Mesin pencocokan belum dipasang.</div>'; return; }
    if (typeof G.bacaBerkasLembar !== 'function') {
      el.innerHTML = '<div id="cb-wrap">' + pita('bad',
        '<b>Pembaca berkas Excel tidak termuat.</b> Halaman ini butuh '
        + '<code>assets/xlsx-baca.js</code>, dan tanpa itu berkas apa pun akan terbaca sebagai rusak. '
        + 'Muat ulang halamannya; kalau tetap begini, berkas asetnya belum ikut ter-deploy.') + '</div>';
      return;
    }
    if (ym !== CB.muat) { muatMutasi(ym); }
    if (!CB.dpMuat) { muatDp(); }
    CB.ym = ym;
    let isi = '<div id="cb-wrap">';
    if (CB.pesan) isi += pita('ok', CB_ESC(CB.pesan));
    if (CB.muat !== ym || (CB.rows.length === 0 && !CB.err && CB.muat !== ym)) {
      isi += '<div class="cb-card"><div class="cb-kosong">Memuat mutasi&hellip;</div></div>';
    } else {
      isi += kartuRingkas() + kartuSumber() + kartuUsulan() + kartuTabel() + kartuDpYatim();
    }
    el.innerHTML = isi + '</div>';
    pasangGaya();
  };

  /* ============ PENANGAN (dipanggil dari onclick di HTML aset ini) ============
     Mengetik TIDAK menggambar ulang halaman — kotak yang dibuat ulang
     kehilangan fokus dan hanya huruf pertama yang masuk. Jebakan yang sudah
     dibayar di queueF() modul Konten. */
  G.cbKetikCari   = el => { CB.cari = el.value; gambarTabelSaja(); };
  G.cbKetikCariDp = el => { CB.cariDp = el.value; gambarTabelSaja(); };
  G.cbKetikTempel = el => { CB.tempel = el.value; };

  /* Menggambar ulang WADAH tabelnya saja, dan kotak cari yang sedang dipegang
     kursor dipulihkan nilainya + posisi kursornya. Lewat gambarUlang() milik
     tuan rumah, gulir melompat ke atas persis saat orang mengetik. */
  function gambarTabelSaja() {
    const w = document.getElementById('cb-wrap');
    if (!w) return;
    const aktif = document.activeElement;
    const tandaCari = aktif && aktif.classList && aktif.classList.contains('cb-cari');
    const pos = tandaCari ? aktif.selectionStart : 0;
    const dalamPanel = tandaCari && !!aktif.closest('.cb-panel');
    const lama = w.querySelectorAll('.cb-card');
    /* Tabel selalu kartu ke-sekian dari belakang yang sama; dicari lewat
       judulnya supaya urutan kartu boleh berubah tanpa memutus ini. */
    for (const c of lama) {
      const h = c.querySelector('h3');
      if (h && h.textContent.indexOf('Mutasi Masuk BRI') === 0) {
        c.outerHTML = kartuTabel();
        break;
      }
    }
    const baru = dalamPanel
      ? document.querySelector('#cb-wrap .cb-panel .cb-cari')
      : document.querySelector('#cb-wrap .cb-card .cb-cari');
    if (baru && tandaCari) { baru.focus(); try { baru.setSelectionRange(pos, pos); } catch (e) {} }
  }

  G.cbTapis = k => { CB.tapis = k; CB.buka = ''; CB.opsi.gambarUlang(); };
  G.cbBuka = id => { CB.buka = (CB.buka === id) ? '' : id; CB.cariDp = ''; CB.opsi.gambarUlang(); };
  G.cbSegarkan = () => { CB.muat = ''; CB.dpMuat = false; CB.dps = null; CB.pesan = ''; CB.opsi.gambarUlang(); };
  G.cbMuatDp = () => { CB.dpMuat = false; CB.dps = null; muatDp(); };
  G.cbBatalPratinjau = () => { CB.pratinjau = null; CB.lembar = null; CB.bacaErr = ''; CB.opsi.gambarUlang(); };

  G.cbPilihBerkas = async function (input) {
    const f = input.files && input.files[0];
    /* Dikosongkan supaya memilih berkas yang SAMA dua kali tetap memicu
       onchange. Tanpa ini, memperbaiki berkasnya di Excel lalu memilihnya
       lagi tidak menghasilkan apa pun. */
    input.value = '';
    if (!f) return;
    CB.bacaErr = ''; CB.pratinjau = null; CB.lembar = null; CB.lembarPilih = 0;
    try {
      const lembar = await G.bacaBerkasLembar(f);
      CB.lembar = lembar.filter(s => s.baris.length);
      if (!CB.lembar.length) throw new Error('Tidak ada satu lembar pun yang berisi.');
      /* Lembar yang namanya menyebut bulan yang sedang dibuka dipilih
         sendiri. Berkas ini menyimpan satu lembar per bulan dan lembar
         PERTAMA-nya belum tentu bulan ini — di berkas aslinya lembar
         pertama Juli sementara yang dikerjakan orang September. */
      const i = CB.lembar.findIndex(s => cocokNamaBulan(s.nama, CB.ym));
      CB.lembarPilih = i >= 0 ? i : 0;
      bacaLembarTerpilih();
    } catch (e) { CB.bacaErr = (e && e.message) || String(e); }
    CB.opsi.gambarUlang();
  };
  function cocokNamaBulan(nama, ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return false;
    const n = String(nama || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = NAMA_BLN[+m[2] - 1].toLowerCase();
    const th2 = m[1].slice(2);
    return n.indexOf(b) === 0 && n.indexOf(th2) > 0;
  }
  G.cbPilihLembar = i => { CB.lembarPilih = i; bacaLembarTerpilih(); CB.opsi.gambarUlang(); };
  function bacaLembarTerpilih() {
    const s = CB.lembar && CB.lembar[CB.lembarPilih];
    if (!s) return;
    CB.pratinjau = G.cbUraiLembar(s.baris);
  }
  G.cbBacaTempel = function () {
    CB.bacaErr = ''; CB.lembar = null;
    const teks = String(CB.tempel || '').trim();
    if (!teks) { CB.bacaErr = 'Belum ada yang ditempel.'; CB.opsi.gambarUlang(); return; }
    /* Tempelan diubah ke bentuk BARIS BERKUNCI HURUF — bentuk yang sama
       dengan keluaran pembaca .xlsx — supaya pengurainya SATU. Dua pengurai
       berarti berkas dan tempelan yang isinya sama bisa menghasilkan baris
       berbeda, dan yang membandingkannya tidak punya cara tahu mana yang
       benar. Aturan yang sama dengan impor Jadwal. */
    const huruf = i => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };
    const baris = teks.split(/\r?\n/).map(b => {
      const o = {}; b.split('\t').forEach((v, i) => { o[huruf(i)] = v; }); return o;
    });
    CB.pratinjau = G.cbUraiLembar(baris);
    CB.opsi.gambarUlang();
  };

  async function kirim(payload, pesanSukses) {
    if (CB.sibuk) return null;
    CB.sibuk = true; CB.pesan = ''; CB.opsi.gambarUlang();
    let j = null;
    try {
      j = await post(payload);
      if (!j || !j.ok) throw new Error((j && j.error) || 'server menolak tanpa menyebut sebab');
      CB.pesan = pesanSukses || 'Tersimpan.';
    } catch (e) {
      CB.sibuk = false;
      alert('Gagal menyimpan: ' + ((e && e.message) || e)
        + '\n\nYang kamu kerjakan TIDAK hilang dari layar — coba lagi setelah sebabnya beres.');
      CB.opsi.gambarUlang();
      return null;
    }
    CB.sibuk = false;
    CB.muat = '';               // tarik ulang daftarnya dari server
    CB.opsi.gambarUlang();
    return j;
  }

  G.cbSimpanUnggah = async function () {
    const p = CB.pratinjau;
    if (!p || !p.ok || !p.baris.length) return;
    const j = await kirim({ action: 'briUnggah', data: { baris: p.baris } }, null);
    if (!j) return;
    const d = j.data || {};
    CB.pratinjau = null; CB.lembar = null; CB.tempel = '';
    CB.pesan = d.baru + ' baris mutasi baru tersimpan'
      + (d.lama ? ', ' + d.lama + ' baris sudah ada sebelumnya (pencocokannya tidak disentuh)' : '')
      + (d.lewat ? ', ' + d.lewat + ' baris dilewati' : '') + '.';
    CB.opsi.gambarUlang();
  };

  G.cbPilihDp = async function (idBaris, dpId) {
    const d = (CB.dps || []).find(x => x.dpId === dpId);
    if (!d) return;
    const j = await kirim({ action: 'briCocok', data: {
      id: idBaris, cara: 'cocok', resId: d.resId, dpId: d.dpId, resNama: d.nama, resTgl: d.resTgl } }, null);
    if (!j) return;
    CB.buka = ''; CB.pesan = 'Dicocokkan ke ' + d.nama + '.';
    CB.opsi.gambarUlang();
  };

  G.cbTerimaUsul = async function (idBaris) {
    const r = CB.rows.find(x => x.id === idBaris);
    if (!r) return;
    const us = G.cbUsulan([r], dpsBulan());
    const u = us[idBaris];
    if (!u) return;
    await G.cbPilihDp(idBaris, u.dp.dpId);
  };

  /* Terapkan sekaligus HANYA yang "pasti". Yang kira-kira sengaja tidak ikut
     walau tombolnya ada di kartu yang sama — kalau ikut, saklarnya jadi
     hiasan: yang sengaja dipisahkan tetap masuk lewat satu tombol yang tidak
     menyebutkannya. */
  G.cbTerapkanPasti = async function () {
    const us = G.cbUsulan(CB.rows.filter(belum), dpsBulan());
    const items = Object.keys(us).filter(i => us[i].babak.pasti).map(i => ({
      id: i, cara: 'cocok', resId: us[i].dp.resId, dpId: us[i].dp.dpId,
      resNama: us[i].dp.nama, resTgl: us[i].dp.resTgl }));
    if (!items.length) return;
    if (!confirm(items.length + ' baris mutasi akan dicocokkan ke DP reservasi.\n\n'
      + 'Semuanya nominal, nama, dan salah satu tanggalnya cocok. '
      + 'Yang salah tetap bisa dilepas satu per satu setelah ini.\n\nLanjut?')) return;
    const j = await kirim({ action: 'briCocok', data: { items } }, null);
    if (!j) return;
    const d = j.data || {};
    const g = (d.gagal || []).length;
    CB.pesan = d.n + ' baris tercocokkan' + (g ? ', ' + g + ' gagal (lihat barisnya, kemungkinan DP-nya keburu dipakai)' : '') + '.';
    CB.opsi.gambarUlang();
  };

  G.cbTandaiBukan = async function (idBaris) {
    const s = prompt('Uang ini masuk dari mana? (mis. "Event corporate PT Ibra", "Sewa videotron", "Setoran tamu")\n\n'
      + 'WAJIB diisi: baris tanpa sebab tidak bisa diperiksa siapa pun, dan ia jadi tempat paling mudah '
      + 'menyembunyikan uang yang sebenarnya belum dicocokkan.');
    if (s === null) return;
    if (!String(s).trim()) { alert('Sebabnya wajib diisi.'); return; }
    const j = await kirim({ action: 'briCocok', data: { id: idBaris, cara: 'bukan', catatan: s } }, null);
    if (!j) return;
    CB.buka = ''; CB.pesan = 'Ditandai bukan DP reservasi.';
    CB.opsi.gambarUlang();
  };

  G.cbLepas = async function (idBaris) {
    if (!confirm('Lepas pencocokan baris ini?\n\nBaris mutasinya TIDAK dihapus — ia cuma kembali ke daftar '
      + '"belum dicocokkan", dan DP-nya bebas dipakai baris lain.')) return;
    const j = await kirim({ action: 'briCocok', data: { id: idBaris, cara: 'lepas' } }, null);
    if (!j) return;
    CB.buka = ''; CB.pesan = 'Pencocokan dilepas.';
    CB.opsi.gambarUlang();
  };

  G.cbBatalBaris = async function (idBaris) {
    const s = prompt('Batalkan baris mutasi ini? Barisnya TIDAK dihapus — ia tetap tergambar, tercoret, '
      + 'dan berhenti ikut dijumlahkan.\n\nAlasan pembatalan (wajib):');
    if (s === null) return;
    if (!String(s).trim()) { alert('Alasan pembatalan wajib diisi.'); return; }
    const j = await kirim({ action: 'briBatal', id: idBaris, alasan: s }, null);
    if (!j) return;
    CB.buka = ''; CB.pesan = 'Baris mutasi dibatalkan.';
    CB.opsi.gambarUlang();
  };

  /* ============ GAYA ============
     DIKURUNG #cb-wrap, dan itu bukan kerapian. Aset ini dipakai dua modul
     yang punya .card, .stat, .seg, th, dan td mereka sendiri di dua puluhan
     halaman lain; ditulis global, seluruh halaman itu ikut bergeser. Pola
     yang sama dengan #pk-wrap di performa-konten.js dan #pfo-wrap di modul
     Marketing.

     KURUNGAN MENAIKKAN KEKHUSUSAN seluruh aturannya di atas milik tuan
     rumah, jadi keadaan aktif saklar WAJIB ikut ditulis di dalam kurungan —
     kalau tidak, tombol yang sedang dipilih mewarisi warna teks dari aturan
     modul sementara latarnya kalah, dan yang terlihat huruf putih di atas
     latar terang. Sudah kejadian di #pk-wrap, 18 September 2026.

     Kelas dan nama variabelnya memakai palet tuan rumah (--gold, --line,
     dsb) yang SAMA PERSIS di kedua modul; nilai yang disalin ke sini akan
     menyimpang begitu salah satu palet disetel. */
  const GAYA = `
#cb-wrap{font-family:var(--font-body,inherit)}
#cb-wrap .cb-card{background:var(--surface,#fff);border:1px solid var(--line,#E7E1D3);
  border-radius:var(--radius,16px);box-shadow:var(--shadow,0 4px 18px rgba(50,42,28,.06));
  padding:20px;margin-bottom:16px}
#cb-wrap .cb-card h3{font-family:var(--font-display,inherit);font-size:15.5px;font-weight:700;
  color:var(--ink,#2A2620);margin:0 0 4px}
#cb-wrap .cb-sub{font-size:12.5px;color:var(--muted,#5C574D);line-height:1.55;margin-bottom:10px}
#cb-wrap .cb-kecil{font-size:11px;line-height:1.4}
#cb-wrap .cb-muted{color:var(--muted-2,#928C80)}
#cb-wrap .cb-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:16px}
#cb-wrap .cb-stat{background:var(--surface,#fff);border:1px solid var(--line,#E7E1D3);
  border-radius:var(--radius,16px);box-shadow:var(--shadow,0 4px 18px rgba(50,42,28,.06));padding:16px 18px}
#cb-wrap .cb-stat.ok{border-color:var(--ok,#1F9D5F)}
#cb-wrap .cb-stat.warn{border-color:var(--warn,#B5831A)}
#cb-wrap .cb-lab{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--muted,#5C574D);margin-bottom:6px}
#cb-wrap .cb-val{font-family:var(--font-display,inherit);font-size:21px;font-weight:800;
  color:var(--ink,#2A2620);-webkit-text-fill-color:currentColor}
#cb-wrap .cb-foot{font-size:11.5px;color:var(--muted-2,#928C80);margin-top:5px}
#cb-wrap .cb-notice{border-radius:var(--radius-sm,10px);padding:10px 13px;font-size:12.5px;
  line-height:1.55;margin:10px 0;border:1px solid var(--line,#E7E1D3);background:var(--paper,#F7F6F4)}
#cb-wrap .cb-notice.ok{background:var(--ok-bg,#E4F5EC);border-color:var(--ok,#1F9D5F)}
#cb-wrap .cb-notice.warn{background:var(--warn-bg,#F7EFDB);border-color:var(--warn,#B5831A)}
#cb-wrap .cb-notice.bad{background:var(--danger-bg,#F8E4DF);border-color:var(--danger,#C9432B)}
#cb-wrap .cb-notice.info{background:var(--info-bg,#E4EFF8);border-color:var(--info,#2F7FC4)}
#cb-wrap .cb-baris-alat{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
#cb-wrap .cb-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;font-size:12.5px;
  font-weight:600;font-family:inherit;border-radius:var(--radius-sm,10px);cursor:pointer;
  border:1px solid var(--line-hard,rgba(60,55,45,.18));background:var(--surface,#fff);
  color:var(--ink,#2A2620)}
#cb-wrap .cb-btn:hover{background:var(--paper,#F7F6F4)}
#cb-wrap .cb-btn[disabled]{opacity:.55;cursor:not-allowed}
#cb-wrap .cb-btn-utama{background:var(--gold,#A9791F);border-color:var(--gold,#A9791F);color:#fff}
#cb-wrap .cb-btn-utama:hover{background:var(--gold-dim,#7A560F)}
#cb-wrap .cb-btn-bahaya{color:var(--danger,#C9432B);border-color:var(--danger,#C9432B)}
#cb-wrap .cb-btn-xs{padding:4px 9px;font-size:11.5px}
#cb-wrap .cb-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:3px;border-radius:var(--radius-sm,10px);
  background:var(--paper,#F7F6F4);border:1px solid var(--line,#E7E1D3)}
#cb-wrap .cb-seg button{padding:6px 12px;font-size:12px;font-weight:600;font-family:inherit;
  border:0;background:transparent;color:var(--muted,#5C574D);border-radius:7px;cursor:pointer}
#cb-wrap .cb-seg button.on,#cb-wrap .cb-seg button.active{background:var(--gold,#A9791F);color:#fff}
#cb-wrap .cb-cari{flex:1;min-width:180px;padding:8px 12px;font-size:12.5px;font-family:inherit;
  border:1px solid var(--line-hard,rgba(60,55,45,.18));border-radius:var(--radius-sm,10px);
  background:var(--surface,#fff);color:var(--ink,#2A2620)}
#cb-wrap .cb-ta{width:100%;padding:10px 12px;font-size:12px;font-family:ui-monospace,monospace;
  border:1px solid var(--line-hard,rgba(60,55,45,.18));border-radius:var(--radius-sm,10px);
  background:var(--surface,#fff);color:var(--ink,#2A2620);margin-bottom:8px}
#cb-wrap .cb-det{margin-top:8px}
#cb-wrap .cb-det>summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted,#5C574D);
  padding:6px 0}
#cb-wrap .cb-tbl-wrap{overflow-x:auto;border:1px solid var(--line,#E7E1D3);border-radius:var(--radius-sm,10px);
  margin-top:10px}
#cb-wrap table.cb-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
#cb-wrap table.cb-tbl th{background:var(--paper,#F7F6F4);text-align:left;padding:10px 12px;
  font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--muted,#5C574D);border-bottom:1px solid var(--line,#E7E1D3);white-space:nowrap}
#cb-wrap table.cb-tbl td{padding:9px 12px;border-bottom:1px solid var(--line-soft,rgba(60,55,45,.10));
  color:var(--ink,#2A2620);vertical-align:top}
#cb-wrap table.cb-tbl tr:last-child td{border-bottom:0}
#cb-wrap table.cb-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#cb-wrap table.cb-tbl .cb-aksi{text-align:right;white-space:nowrap}
#cb-wrap table.cb-tbl-kecil td{padding:7px 10px;font-size:12px}
#cb-wrap tr.cb-coret td{opacity:.5;text-decoration:line-through}
#cb-wrap .cb-chip{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:700;
  background:var(--paper,#F7F6F4);border:1px solid var(--line,#E7E1D3);color:var(--muted,#5C574D);white-space:nowrap}
#cb-wrap .cb-chip.ok{background:var(--ok-bg,#E4F5EC);border-color:var(--ok,#1F9D5F);color:var(--ok,#1F9D5F)}
#cb-wrap .cb-chip.warn{background:var(--warn-bg,#F7EFDB);border-color:var(--warn,#B5831A);color:var(--warn,#B5831A)}
#cb-wrap .cb-chip.bad{background:var(--danger-bg,#F8E4DF);border-color:var(--danger,#C9432B);color:var(--danger,#C9432B)}
#cb-wrap .cb-usul{font-size:12px;color:var(--info,#2F7FC4)}
#cb-wrap .cb-pas{color:var(--ok,#1F9D5F);font-weight:700}
#cb-wrap .cb-beda{color:var(--muted-2,#928C80)}
#cb-wrap tr.cb-panel-baris>td{background:var(--paper,#F7F6F4);padding:0}
#cb-wrap .cb-panel{padding:14px 16px}
#cb-wrap .cb-panel-judul{font-size:13px;font-weight:700;color:var(--ink,#2A2620);margin-bottom:8px}
#cb-wrap .cb-panel-kaki{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#cb-wrap .cb-pra{margin-top:12px;padding:12px 14px;border:1px dashed var(--gold,#A9791F);
  border-radius:var(--radius-sm,10px);background:var(--gold-glow,rgba(169,121,31,.13))}
#cb-wrap .cb-kosong{padding:26px 16px;text-align:center;font-size:12.5px;color:var(--muted,#5C574D)}
#cb-wrap code{font-family:ui-monospace,monospace;font-size:11.5px;background:var(--paper,#F7F6F4);
  padding:1px 5px;border-radius:5px}
`;
  let gayaTerpasang = false;
  function pasangGaya() {
    if (gayaTerpasang || !document.head) return;
    const s = document.createElement('style');
    s.id = 'cb-gaya';
    s.textContent = GAYA;
    document.head.appendChild(s);
    gayaTerpasang = true;
  }

  /* Dibuka untuk uji — dan HANYA untuk uji. Tuan rumah tidak boleh
     menyentuhnya: state yang disetel dari luar akan menyimpang dari yang
     dibaca penggambar, dan yang menyimpang di sini angka uang. */
  G.__cbState = CB;
})(window);
