/************************************************************************
 * esb-pos.js — SUMBER TUNGGAL penarik & perangkum bill ESB satu hari
 * (20 Oktober 2026, permintaan user)
 * ---------------------------------------------------------------------
 * Dipakai modul Cashier (Report Daily, Compliment, Void Menu, Daily Stock
 * Rokok) dan panel Finance > Omset (Input Omset Harian, Breakdown Sumber).
 * Lima halaman yang menjumlahkan bill yang SAMA dengan aturan masing-masing
 * pasti menyimpang suatu hari — dan yang menyimpang di sini angka uang yang
 * tertulis beda di dua layar untuk hari yang sama. Pola yang sama dengan
 * performa-bonus.js dan xlsx-baca.js.
 *
 * TIDAK MENULIS APA PUN. Yang dipulangkan ringkasan; tiap halaman cuma
 * MENGISI kotaknya, dan yang menyimpan tetap tombol Simpan/Submit di sana.
 *
 * Datanya lewat kompas-api?action=esbHalaman (token ESB di config.php,
 * berpagar sesi Office). Lihat kompas-mysql/lib_esb.php.
 *
 * SELURUHNYA DI DALAM SATU IIFE — tuan rumah punya num()/esc() sendiri, dan
 * dua const bernama sama di lingkup global skrip klasik mematikan halaman
 * dengan SyntaxError sebelum satu baris pun jalan.
 ************************************************************************/
(function (W) {
  'use strict';
  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const BATAL_RE = /cancel|void|batal/i;
  const ORDER_RE = /^\s*ESB\s*ORDER\s*$/i;

  /* Nama metode bayar ESB -> kunci PAYS. Yang tidak ada di sini TIDAK ditebak
     ke kotak mana pun — dilaporkan sebagai `asing`. */
  const PETA_BAYAR = {
    CASH:'cash', TUNAI:'cash', COMPLIMENT:'compliment', COMPLIMENTARY:'compliment',
    EDCBCA:'edc_bca', EDCBRI:'edc_bri', EDCMANDIRI:'edc_mandiri',
    ERRORBAR:'error_bar', ERRORCUSTOMER:'error_customer', ERRORFLOOR:'error_floor',
    ERRORKASIR:'error_kasir', ERRORCASHIER:'error_kasir', ERRORKITCHEN:'error_kitchen',
    GOFOOD:'gofood', GRABFOOD:'grabfood', MEMBERDEPOSIT:'member_dep', DEPOSIT:'member_dep',
    QRISBCA:'qris_bca', QRISBRI:'qris_bri', QRISMANDIRI:'qris_mandiri',
    QRISESB:'qris_esb', QRISPOS:'qris_esb',
    TIKTOKGO:'tiktokgo', TRANSFERUOB:'transfer_uob', TRANSFER:'transfer_uob',
    VOUCHER:'voucher'
  };
  /* Bill ESB ORDER (pesan sendiri lewat QR meja) dibayar lewat gateway ESB,
     jadi masuk baris QRIS POS apa pun nama metodenya — KECUALI metode yang
     jelas bukan QRIS: uang itu memang tidak lewat gateway. */
  const BUKAN_QRIS = ['cash','voucher','compliment','member_dep','edc_bca','edc_bri','edc_mandiri',
    'error_bar','error_customer','error_floor','error_kasir','error_kitchen'];
  const kunciBayar = nama => PETA_BAYAR[String(nama || '').toUpperCase().replace(/[^A-Z0-9]/g, '')] || '';

  /* Tarik SELURUH halaman satu tanggal. `post(payload)` milik tuan rumah
     (sudah membawa sesi). Satu halaman gagal 3x = BERHENTI dan melempar —
     ringkasan dari hari yang bolong lebih buruk daripada tidak ada. */
  async function tarikHari(tgl, post, onProgress) {
    const ambil = async page => {
      let e = null;
      for (let i = 0; i < 3; i++) {
        try {
          const r = await post({ action: 'esbHalaman', dari: tgl, sampai: tgl, page });
          if (r && r.ok) return r.data;
          e = new Error((r && r.error) || 'balasan tidak dikenal');
          if (/token|sesi|akses|modul/i.test(e.message)) break;
        } catch (x) {
          e = (x instanceof TypeError)
            ? new Error('koneksi ke server Office terputus (bukan dari ESB). Periksa internet lalu coba lagi.') : x;
        }
        await new Promise(s => setTimeout(s, 800 * (i + 1)));
      }
      throw new Error('Halaman ' + page + ': ' + (e ? e.message : 'gagal'));
    };
    const bills = {}; let page = 1, total = null;
    for (;;) {
      const d = await ambil(page);
      const isi = (d && d.bills) || [];
      isi.forEach(B => { if (B && B.salesNum) bills[B.salesNum] = B; });
      if (d && d.pageCount) total = d.pageCount;
      if (onProgress) onProgress(page, total);
      if (!isi.length) break;
      if (total && page >= total) break;
      if (!total && d && d.perPage && isi.length < d.perPage) break;
      if (page >= 500) break;
      page++;
    }
    return Object.values(bills);
  }

  const menuHidup = M => M && !BATAL_RE.test(String(M.statusName || ''));
  const nilaiMenu = M => N(M.price) * N(M.qty)
    + (M.extras || []).reduce((a, x) => a + N(x.price) * N(x.qty), 0);
  const kelompok = M => {
    const k = String(M.menuCategoryName || '').trim().toUpperCase();
    return k === 'FOOD' ? 'food' : (k === 'BEVERAGES' || k === 'BEVERAGE') ? 'bev' : 'lainnya';
  };
  const kasirBill = B => String(B.editedBy || B.createdBy || '').trim();

  /* Pembayaran satu bill per kunci PAYS. Nominal CASH adalah uang yang
     DISERAHKAN tamu: kelebihan atas grandTotal (kembalian) dipotong dari
     komponen CASH — aturan BAYAR_TUNAI di Analytics. */
  function bayarBill(B) {
    const ps = (B.salesPayments || []).filter(p => p && p.paymentMethodName)
      .map(p => ({ nama: String(p.paymentMethodName).trim(), nil: N(p.paymentAmount) }));
    const grand = N(B.grandTotal);
    const lebih = grand > 0 ? ps.reduce((a, p) => a + p.nil, 0) - grand : 0;
    if (lebih > 0) { const t = ps.find(p => kunciBayar(p.nama) === 'cash'); if (t) t.nil = Math.max(0, t.nil - lebih); }
    const order = ORDER_RE.test(String(B.visitPurposeName || ''));
    return ps.map(p => {
      let k = kunciBayar(p.nama);
      if (order && BUKAN_QRIS.indexOf(k) < 0) k = 'qris_esb';
      return { nama: p.nama, k, nil: p.nil, order };
    });
  }

  /* Satu bill: net = grand − service − tax (itu yang membuat tagihan = POS);
     gross = nilai menu hidup (kalau lebih kecil dari net, dinaikkan ke net),
     diskon = gross − net. Jadi gross − diskon + service + tax = grandTotal. */
  function angkaBill(B) {
    const menus = (B.salesMenus || []).filter(menuHidup);
    const svc = N(B.otherTaxTotal), tax = N(B.vatTotal), grand = N(B.grandTotal);
    const net = grand - svc - tax;
    const kat = { food: 0, bev: 0, lainnya: 0 }, qty = { food: 0, bev: 0, lainnya: 0 };
    menus.forEach(M => { const g = kelompok(M); kat[g] += nilaiMenu(M); qty[g] += N(M.qty); });
    const sumMenu = kat.food + kat.bev + kat.lainnya;
    const gross = Math.max(sumMenu, net);
    if (gross > sumMenu) {
      if (sumMenu > 0) { const f = gross / sumMenu; kat.food *= f; kat.bev *= f; kat.lainnya *= f; }
      else kat.lainnya = gross;
    }
    return { svc, tax, grand, net, gross, disc: gross - net, kat, qty };
  }

  function ringkasHari(bills) {
    const R = {
      nBill: 0, nBatal: 0, bayar: {}, asing: {}, order: { n: 0, nil: 0 },
      food: 0, bev: 0, lainnya: 0, disc: 0, svc: 0, tax: 0, grand: 0, pax: 0,
      qty: { food: 0, bev: 0, lainnya: 0 },
      kasir: {}, self: { amount: 0, disc: 0, n: 0 },
      komp: [], void: [], menuQty: {}
    };
    (bills || []).forEach(B => {
      if (!B || !B.salesNum) return;
      const bill = String(B.salesNum);
      /* Bill BATAL: tidak dihitung di omset, tapi seluruh menunya adalah void —
         itu yang dicari halaman Void Menu. */
      if (BATAL_RE.test(String(B.statusName || ''))) {
        R.nBatal++;
        const items = (B.salesMenus || []).map(M => ({ item: String(M.menuName || '').trim(), qty: N(M.qty), sub: nilaiMenu(M) }))
          .filter(x => x.item);
        if (items.length) R.void.push({ bill, utuh: true, waiter: namaKaryawan(B.createdBy), kasir: namaKaryawan(kasirBill(B)),
          alasan: String(B.cancelNotes || B.additionalInfo || '').trim(), items, meja: String(B.tableName || '') });
        return;
      }
      R.nBill++;
      const A = angkaBill(B);
      R.food += A.kat.food; R.bev += A.kat.bev; R.lainnya += A.kat.lainnya;
      R.qty.food += A.qty.food; R.qty.bev += A.qty.bev; R.qty.lainnya += A.qty.lainnya;
      R.disc += A.disc; R.svc += A.svc; R.tax += A.tax; R.grand += A.grand;
      R.pax += Math.max(1, N(B.paxTotal));

      const order = ORDER_RE.test(String(B.visitPurposeName || ''));
      if (order) { R.self.amount += A.gross; R.self.disc += A.disc; R.self.n++; }
      else {
        const ks = kasirBill(B) || '(tanpa nama kasir)';
        const x = R.kasir[ks] || (R.kasir[ks] = { amount: 0, disc: 0, n: 0 });
        x.amount += A.gross; x.disc += A.disc; x.n++;
      }

      const ps = bayarBill(B);
      let nilKomp = 0, nilDep = 0;
      ps.forEach(p => {
        if (p.k) R.bayar[p.k] = (R.bayar[p.k] || 0) + p.nil; else R.asing[p.nama] = (R.asing[p.nama] || 0) + p.nil;
        if (p.order && p.k === 'qris_esb') { R.order.nil += p.nil; }
        if (p.k === 'compliment') nilKomp += p.nil;
        if (p.k === 'member_dep') nilDep += p.nil;
      });
      if (order) R.order.n++;
      /* Compliment & Member Deposit dirinci per bill, porsinya menurut
         nominalnya terhadap grandTotal — supaya sub total, tax, dan service
         yang dicatat sama persis dengan yang dicetak mesin. */
      [['compliment', nilKomp], ['member_dep', nilDep]].forEach(([jenis, nil]) => {
        if (nil <= 0) return;
        const share = A.grand > 0 ? Math.min(1, nil / A.grand) : 1;
        const tax = Math.round(A.tax * share), service = Math.round(A.svc * share);
        const menus = (B.salesMenus || []).filter(menuHidup).map(M => String(M.menuName || '').trim()).filter(Boolean);
        R.komp.push({ bill, jenis, nominal: Math.round(nil), tax, service, subTotal: Math.round(nil) - tax - service,
          info: String(B.additionalInfo || '').trim(), menu: menus, kasir: namaKaryawan(kasirBill(B)), meja: String(B.tableName || '') });
      });

      /* Menu void di dalam bill yang tetap jalan. */
      const vd = (B.salesMenus || []).filter(M => M && !menuHidup(M))
        .map(M => ({ item: String(M.menuName || '').trim(), qty: N(M.qty), sub: nilaiMenu(M),
          waiter: namaKaryawan(M.createdBy), alasan: String(M.cancelNotes || '').trim() })).filter(x => x.item);
      if (vd.length) R.void.push({ bill, utuh: false, waiter: vd[0].waiter, kasir: namaKaryawan(kasirBill(B)),
        alasan: vd.map(x => x.alasan).filter(Boolean).filter((a, i, s) => s.indexOf(a) === i).join('; '),
        items: vd, meja: String(B.tableName || '') });

      /* Qty terjual per nama menu — untuk Daily Stock Rokok. */
      (B.salesMenus || []).filter(menuHidup).forEach(M => {
        const n = String(M.menuName || '').trim().toUpperCase(); if (!n) return;
        const x = R.menuQty[n] || (R.menuQty[n] = { qty: 0, kat: String(M.menuCategoryDetailName || '').trim().toUpperCase(),
          kel: String(M.menuCategoryName || '').trim().toUpperCase() });
        x.qty += N(M.qty);
      });
    });
    return R;
  }

  /* Pencocokan nama: token nama (huruf/angka, ≥2 huruf) yang SEMUANYA ada di
     teks lawan. Dipakai untuk item rokok (nama item vs nama menu) dan kasir
     (akun POS vs nama Office). Yang cocok ke lebih dari satu TIDAK ditebak. */
  const token = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter(t => t.length >= 2 || /\d/.test(t));
  function cocokToken(pendek, panjang) {
    const a = token(pendek), b = token(panjang);
    if (!a.length) return false;
    return a.every(t => b.some(u => u === t || (t.length >= 3 && u.startsWith(t))));
  }

  /* Item rokok -> qty keluar. Tiap menu ESB diberikan ke item yang tokennya
     PALING BANYAK cocok (Dos Hermanos vs Dos H. Rojo); seri = ambigu. */
  /* NAMA DI POS (20 Okt 2026). Nama menu di POS tidak sama dengan nama item
     di lembar stok — "LA ICE PURPLE" itu LA Purple (dan kebetulan juga memuat
     kata LA ICE), "LA MANGGO" salah eja LA Mango, "SUPER"/"MILD" tanpa kata
     Djarum. Pencocokan kata tidak bisa menebak itu, jadi item boleh membawa
     daftar nama POS-nya sendiri (`pos`: [{nama, kali}]) yang dicocokkan PERSIS
     sesudah dibakukan. `kali` untuk menu yang menjual beberapa unit sekaligus
     (KOIN 2 PCS = 2 coin). Item TANPA daftar tetap memakai kemiripan kata,
     tapi tidak pernah mengambil menu yang sudah diklaim daftar item lain. */
  const baku = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  function petakanRokok(items, menuQty) {
    const out = {}; items.forEach(it => { out[it.k] = 0; });
    const ambigu = [], takKenal = [], kena = {};
    const persis = {};
    items.forEach(it => (it.pos || []).forEach(p => {
      const n = baku(p.nama); if (!n) return;
      (persis[n] = persis[n] || []).push({ it, kali: Number(p.kali) > 0 ? Number(p.kali) : 1 });
    }));
    const bebas = items.filter(it => !(it.pos || []).length);
    Object.keys(menuQty).forEach(nama => {
      const P = persis[baku(nama)];
      if (P) {
        if (P.length > 1) { ambigu.push({ nama, qty: menuQty[nama].qty, ke: P.map(x => x.it.n) }); return; }
        out[P[0].it.k] += menuQty[nama].qty * P[0].kali; kena[P[0].it.k] = true; return;
      }
      const cand = bebas.filter(it => cocokToken(it.n, nama));
      if (!cand.length) {
        const m = menuQty[nama];
        if (/ROKOK|CIGAR|TOBACCO|SMOK|COIN|KOIN/.test(m.kat)) takKenal.push({ nama, qty: m.qty });
        return;
      }
      const skor = it => token(it.n).length;
      const max = Math.max.apply(null, cand.map(skor));
      const top = cand.filter(it => skor(it) === max);
      if (top.length > 1) { ambigu.push({ nama, qty: menuQty[nama].qty, ke: top.map(t => t.n) }); return; }
      out[top[0].k] += menuQty[nama].qty; kena[top[0].k] = true;
    });
    return { out, ambigu, takKenal, kena };
  }

  /* Akun kasir POS -> karyawan.
     1. PETA TERSIMPAN dulu (`peta`: {AKUN BAKU: id karyawan}) — diisi orang di
        Breakdown Sumber. Akun POS di produksi bernama MUDAFEILA, MUDANINDY,
        MUDAKASIR2 (diperiksa 20 Okt 2026): nama panggilan berawalan "MUDA",
        sebagian dengan ejaan lain dari nama di Office (FEILA vs Faila), dan
        sebagian akun bersama — tidak ada aturan yang bisa menebak semuanya.
     2. Kalau belum ada di peta: awalan MUDA dibuang, lalu cocok kalau seluruh
        token akun ada di nama karyawan (atau sebaliknya). Tepat satu.

     EMPLOYEE NAME (21 Okt 2026, dari layar master user ESB yang dikirim
     user): API penjualan cuma memulangkan USERNAME (createdBy/editedBy),
     jadi pasangan username -> Employee Name dicatat di sini. Ini yang
     dipakai mencocokkan ke kasir Office DAN yang ditampilkan di layar —
     bukan username. Yang penting: MUDAKASIR2 = ANDY, MUDAKASIR1 = NOVI,
     MUDANINDY = TASYA (username-nya TIDAK sama dengan orangnya).
     Username baru di ESB yang belum ada di sini jatuh ke username tanpa
     awalan MUDA, dan tetap bisa dipetakan manual di Breakdown. */
  const KARYAWAN_ESB = {
    MUDAKASIR2: 'ANDY', MUDACINDY: 'CINDY', MUDADEVANI: 'DEVANI', MUDADEVI: 'DEVI',
    MUDAFEILA: 'FEILA', MUDAGITA: 'GITA', MUDAGRACE: 'GRACE', MUDAKASIR1: 'NOVI',
    MUDARIZKI: 'RIZKI', MUDASPV: 'SPV', MUDASULIS: 'SULIS', MUDANINDY: 'TASYA',
    MUDAYASMIN: 'YASMIN'
  };
  /* Nama panggilan di ESB -> kata yang ada di nama lengkap Office. Hanya
     yang ejaannya beda: FEILA = Faila Ayu Pratiwi, ANDY = Safriandi,
     NOVI = Novianti Kemala, GRACE = Gresya Aulodia. Ini TEBAKAN dari
     kemiripan nama (21 Okt 2026); yang salah dibetulkan lewat pemetaan
     manual di Breakdown, yang selalu menang. */
  const PANGGILAN_OFFICE = { FEILA: 'FAILA', ANDY: 'SAFRIANDI', NOVI: 'NOVIANTI', GRACE: 'GRESYA' };
  const tanpaAwalan = a => { const b = baku(a); const m = b.match(/^MUDA\s*(.{3,})$/); return m ? m[1] : b; };
  const namaKaryawan = u => { const b = baku(u); return KARYAWAN_ESB[b] || (b ? tanpaAwalan(b) : ''); };
  function petakanKasir(emps, kasirEsb, peta) {
    const hasil = {}, takKenal = {};
    peta = peta || {};
    Object.keys(kasirEsb).forEach(akun => {
      const idPeta = peta[baku(akun)];
      const lewatPeta = idPeta ? emps.filter(e => String(e.id) === String(idPeta)) : [];
      const nama = namaKaryawan(akun);
      const inti = PANGGILAN_OFFICE[nama] || nama;
      kasirEsb[akun].nama = nama;
      const cand = lewatPeta.length ? lewatPeta
        : emps.filter(e => cocokToken(inti, e.name) || cocokToken(e.name, inti));
      if (cand.length === 1) {
        const r = hasil[cand[0].id] || (hasil[cand[0].id] = { amount: 0, disc: 0, akun: [] });
        r.amount += kasirEsb[akun].amount; r.disc += kasirEsb[akun].disc; r.akun.push(nama + ' (' + akun + ')');
      } else takKenal[akun] = Object.assign({ ambigu: cand.length > 1 }, kasirEsb[akun]);
    });
    return { hasil, takKenal };
  }

  W.esbPos = { tarikHari, ringkasHari, kunciBayar, petakanRokok, petakanKasir, cocokToken, baku, namaKaryawan, KARYAWAN_ESB, PETA_BAYAR };
})(window);
