/************************************************************************
 * LEMBAR INVOICE MARKETING — SATU BERKAS, DIPAKAI DUA MODUL (28 Okt 2026)
 * ---------------------------------------------------------------------
 * Lembar invoice DP & pelunasan sampai hari ini cuma digambar di modul
 * Marketing (invoiceMktDoc). Finance — yang MENERBITKAN nomornya — tidak
 * pernah bisa melihat hasilnya, dan permintaan user: "ketika invoice
 * diterbitkan, dari sisi finance bisa melihat hasil invoice PDF-nya".
 *
 * KENAPA BERKAS BERSAMA, BUKAN DISALIN
 * Alasan yang sama dengan assets/kwitansi-sheet.js: dua salinan lembar untuk
 * satu perusahaan akan diperbaiki sendiri-sendiri (rekening, alamat, tata
 * letak tanda tangan), dan yang tertinggal tetap tercetak tanpa ada yang
 * menyadarinya sampai dua lembar berdiri berdampingan.
 *
 * MENERIMA DATA DATAR, bukan record event. Marketing memetakannya dari
 * event yang HIDUP (eventFinance); Finance memetakannya dari `ringkas` —
 * keadaan saat permintaannya diajukan, karena Finance tidak punya akses ke
 * database Marketing. Kalau rincian event diubah SESUDAH invoice terbit,
 * kedua layar bisa menyebut angka berbeda, dan yang di Finance-lah yang
 * sesuai dengan yang disetujui.
 *
 * Membawa esc(), rp(), dan pemformat tanggalnya sendiri — kedua tuan rumah
 * memformat tanggal dengan fungsi berbeda, dan lembar yang sama harus tidak
 * bisa dibedakan dari modul mana pun ia dicetak.
 ************************************************************************/
(function(){
  var KOP = {
    pt: 'PT. LAKSAMANA MUDA BERSATU',
    alamat: 'Jl. Soekarno - Hatta No. 39, Labuh Baru Tim, Kec. Payung Sekaki,<br>Kota Pekanbaru, Riau 28282',
    bank: 'UOB | PT. Laksamana Muda Bersatu',
    rek: '319-303-3588'
  };
  var HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  var BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  /* "Rp 1.000.000" — sama dengan rp() modul Marketing, tempat lembar ini
     lahir; lembar sebelum & sesudah pemindahan tidak boleh berbeda. */
  function rp(n){ return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
  /* yyyy-mm-dd -> "Rabu, 28 Oktober 2026". Dibaca sebagai tanggal LOKAL
     (T00:00:00), bukan UTC — tanggal tanpa jam yang dibaca UTC bergeser satu
     hari di zona barat. */
  function tgl(iso){
    if (!iso) return '—';
    var x = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    if (isNaN(x)) return esc(iso);
    return HARI[x.getDay()] + ', ' + x.getDate() + ' ' + BULAN[x.getMonth()] + ' ' + x.getFullYear();
  }

  /* Terapkan ubahan Keterangan dari Marketing ke daftar baris tagihan.
     `ket` = [{asal, teks}] sejajar urutan saat diubah. Dicocokkan lewat
     `asal` (teks bawaan barisnya), BUKAN lewat posisi saja: kalau rincian di
     Marketing disusun ulang sesudahnya, ubahan yang menempel menurut posisi
     akan tercetak di baris yang salah — keterangan "Sewa sound" di baris
     harga makanan — tanpa satu pun galat. Posisi dipakai dulu (cepat & benar
     untuk kasus biasa), lalu jatuh ke pencarian `asal` yang belum terpakai.
     Teks ubahan yang kosong = pakai teks bawaan. */
  function terapkanKet(items, ket){
    items = Array.isArray(items) ? items : [];
    ket = Array.isArray(ket) ? ket : [];
    var pakai = {};
    return items.map(function(it, i){
      var asal = String(it.desc == null ? '' : it.desc);
      var k = ket[i];
      var j = (k && String(k.asal) === asal && !pakai[i]) ? i : -1;
      if (j < 0) {
        for (var n = 0; n < ket.length; n++) {
          if (!pakai[n] && ket[n] && String(ket[n].asal) === asal) { j = n; break; }
        }
      }
      var teks = '';
      if (j > -1) { pakai[j] = true; teks = String(ket[j].teks || '').trim(); }
      var o = {}; for (var x in it) o[x] = it[x];
      o.ket = teks || asal;
      o.diubah = !!teks && teks !== asal;
      return o;
    });
  }

  function barisTotal(t){
    var n = Number(t.nilai) || 0;
    /* "- Rp x", bukan "Rp -x": tanda minus di tengah angka mudah terbaca
       sebagai bagian nominalnya oleh client. */
    var teks = (n < 0 ? '- ' + rp(-n) : rp(n));
    return '<tr><td colspan="3" style="padding:6px 12px;text-align:right;' +
      (t.tebal ? 'font-weight:700;' : 'color:#555;') + 'font-size:12px">' + esc(t.label) + '</td>' +
      '<td style="padding:6px 12px;text-align:right;font-family:ui-monospace,monospace;' +
      (t.tebal ? 'font-weight:700;font-size:13px;' : 'font-size:12px;') + 'white-space:nowrap">' + teks + '</td></tr>';
  }

  /* d = data datar:
       logo, no, resmi, lunas, tanggalTerbit (yyyy-mm-dd)
       kepada, up                     — kepala lembar (bisa diubah Marketing)
       acara, tanggalAcara, jenisAcara, pax
       items  [{desc, qty, harga}]    — desc = teks bawaan
       ket    [{asal, teks}]          — ubahan Keterangan dari Marketing
       totals [{label, nilai, tebal}] — dirakit pemanggil, karena aturan
                                        baris pengurang pelunasan memang
                                        berbeda sumbernya di tiap modul
       penanda [{nama, jabatan, ttd}], cap
       kaki   teks kecil kanan bawah, mis. "Dicetak … oleh …" */
  function html(d){
    d = d || {};
    var lunas = !!d.lunas, resmi = !!d.resmi;
    var noDok = resmi && d.no ? d.no : '—';
    var items = terapkanKet(d.items, d.ket);

    var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F7BB0E;padding-bottom:16px;margin-bottom:20px">' +
      '<div style="display:flex;gap:12px;align-items:center">' +
        (d.logo ? '<img src="' + esc(d.logo) + '" alt="" style="width:46px;height:46px;object-fit:contain;flex:none">' : '') +
        '<div><div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#0C1826">' + KOP.pt + '</div>' +
        '<div style="font-size:10px;letter-spacing:.2em;color:#C8940A">LAKSAMANA MUDA COFFEE &amp; LIVE SPACE</div>' +
        '<div style="font-size:10.5px;color:#666;margin-top:4px;line-height:1.5">' + KOP.alamat + '</div></div></div>' +
      '<div style="text-align:right"><div style="font-size:11px;letter-spacing:.15em;color:#C8940A;font-weight:700">' +
        (lunas ? 'INVOICE PELUNASAN' : 'INVOICE DOWN PAYMENT') + '</div>' +
        '<div style="font-size:18px;font-family:Georgia,serif;font-weight:700;margin-top:4px">' + esc(noDok) + '</div>' +
        '<div style="font-size:11.5px;color:#555;margin-top:2px">' + tgl(d.tanggalTerbit) + '</div>' +
        (resmi ? '' : '<div style="font-size:10px;color:#C0392B;margin-top:4px;font-weight:700">BELUM DITERBITKAN FINANCE</div>') +
      '</div></div>';

    /* "U.P" (untuk perhatian), bukan "PIC" — permintaan user 28 Okt 2026.
       Lembar ini dibaca client, dan "PIC" adalah istilah internal kita. */
    h += '<div style="background:#F6F4EE;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12.5px">' +
      '<div><b>Kepada</b>: ' + esc(d.kepada || '—') + '</div><div><b>U.P</b>: ' + esc(d.up || '—') + '</div>' +
      '<div><b>Acara</b>: ' + esc(d.acara || '—') + '</div><div><b>Tanggal acara</b>: ' + tgl(d.tanggalAcara) + '</div>' +
      '<div><b>Jenis</b>: ' + esc(d.jenisAcara || '—') + '</div><div><b>Estimasi</b>: ' + esc(d.pax || '—') + ' pax</div></div>';

    var th = 'padding:8px 12px;font-size:11px;border-bottom:1px solid #e5e2da';
    h += '<table style="width:100%;border-collapse:collapse;margin-bottom:6px">' +
      '<thead><tr style="background:#F2EFE7">' +
        '<th style="text-align:left;' + th + '">Keterangan</th>' +
        '<th style="text-align:right;' + th + ';width:60px">Qty</th>' +
        '<th style="text-align:right;' + th + ';width:120px">Harga</th>' +
        '<th style="text-align:right;' + th + ';width:130px">Jumlah</th>' +
      '</tr></thead><tbody>';
    if (items.length) {
      var td = 'padding:7px 12px;font-size:12px;border-bottom:1px solid #efece5';
      items.forEach(function(r, i){
        var qty = (Number(r.qty) || 0) || 1, harga = Number(r.harga) || 0;
        h += '<tr style="background:' + (i % 2 ? '#fff' : '#faf9f5') + '">' +
          '<td style="' + td + ';white-space:pre-line">' + esc(r.ket || '—') + '</td>' +
          '<td style="' + td + ';text-align:right">' + qty + '</td>' +
          '<td style="' + td + ';text-align:right;font-family:ui-monospace,monospace">' + rp(harga) + '</td>' +
          '<td style="' + td + ';text-align:right;font-family:ui-monospace,monospace">' + rp(qty * harga) + '</td></tr>';
      });
    } else {
      h += '<tr><td colspan="4" style="padding:12px;font-size:12px;color:#888;text-align:center">Rincian tagihan belum diisi.</td></tr>';
    }
    h += '</tbody><tfoot>' + (d.totals || []).map(barisTotal).join('') + '</tfoot></table>';

    h += '<div style="background:#FBF3D8;border-radius:10px;padding:12px 18px;margin-top:16px;font-size:12px;line-height:1.7">' +
      '<b>Pembayaran ditujukan ke</b><br>' + esc(KOP.bank) + ' &middot; No. Rek <b>' + esc(KOP.rek) + '</b>' +
      '<br><span style="color:#666">Mohon cantumkan nomor invoice ' + esc(noDok) + ' pada berita transfer.</span></div>';

    /* Lembar belum resmi / tanpa penanda tangan: GARIS tanda tangan dengan
       jabatan bawaan — kotak kosong tanpa garis terbaca seperti gambar yang
       gagal termuat. */
    var pen = (resmi && Array.isArray(d.penanda) && d.penanda.length)
      ? d.penanda
      : [{nama:'', jabatan:'Direktur', ttd:''}, {nama:'', jabatan:'Finance', ttd:''}];
    var cap = d.cap || '';
    h += '<div style="display:flex;justify-content:flex-end;gap:26px;margin-top:26px;font-size:12px">' +
      pen.map(function(p, i){
        return '<div style="text-align:center;min-width:180px;position:relative">' +
          '<div style="color:#666">Hormat kami,</div>' +
          (i === 0 && cap ? '<img src="' + esc(cap) + '" alt="" style="position:absolute;left:50%;top:14px;transform:translateX(-50%) rotate(-12deg);height:86px;opacity:.85">' : '') +
          (p.ttd ? '<img src="' + esc(p.ttd) + '" alt="" style="height:56px;margin:4px 0;position:relative">'
                 : '<div style="height:56px"></div><div style="border-bottom:1px solid #bbb;margin:0 12px 5px"></div>') +
          '<div style="font-weight:700;position:relative">' + esc(p.nama || '(...................)') + '</div>' +
          '<div style="color:#666;position:relative">' + esc(p.jabatan || '') + '</div></div>';
      }).join('') +
    '</div>';

    h += '<div style="margin-top:26px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;display:flex;justify-content:space-between">' +
      '<span>' + KOP.pt + ' &middot; @laksamanamuda.id</span><span>' + esc(d.kaki || '') + '</span></div>';

    return '<div class="doc" style="max-width:800px;margin:0 auto;padding:34px 40px;font-family:Inter,sans-serif;color:#1a1a1a">' + h + '</div>';
  }

  /* Dokumen utuh untuk jendela baru (dipakai Finance). Marketing tetap
     memakai html() di dalam mesin cetaknya sendiri (printBrief) karena
     halamannya berpelindung CSP. */
  function halaman(d){
    return '<!doctype html><html><head><meta charset="utf-8"><title>Invoice ' + esc(d && d.no || '') + '</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#fff}' +
      '@page{size:A4;margin:10mm}@media print{.noprint{display:none}}' +
      '.noprint{margin:18px 0 28px;text-align:center}' +
      '.noprint button{font:600 13px/1 "Segoe UI",Arial;padding:10px 18px;border-radius:8px;border:0;background:#C9A227;color:#2a2620;cursor:pointer}</style>' +
      '</head><body>' + html(d) +
      '<div class="noprint"><button onclick="window.print()">🖨️ Simpan sebagai PDF / Cetak</button></div></body></html>';
  }
  /* Menulis ke jendela yang SUDAH dibuka pemanggil (window.open harus di
     dalam gestur klik, sebelum satu pun await). TIDAK langsung memanggil
     print(): Finance membukanya untuk MELIHAT dulu; tombol cetaknya ada. */
  function tulis(w, d){
    try { w.document.open(); w.document.write(halaman(d)); w.document.close(); }
    catch(e){ return false; }
    return true;
  }

  /* CAP (stempel LUNAS) HANYA KALAU BUKTI BAYARNYA ADA (26 Oktober 2026).
     Pindah ke sini 28 Oktober 2026 supaya Marketing dan Finance memakai
     aturan yang SAMA — dua salinan berarti satu layar bercap dan layar
     sebelahnya tidak untuk lembar yang sama.
       bayar = [{jenis:'DP'|'Pelunasan'|..., adaBukti:bool}]
       DP        : ada pembayaran DP yang berbukti (kalau tidak ada baris DP,
                   pembayaran apa pun yang berbukti).
       Pelunasan : pembayaran Pelunasan yang berbukti; kalau tidak ada baris
                   Pelunasan, SELURUH pembayaran wajib berbukti. */
  function adaBukti(bayar, jenis){
    var p = Array.isArray(bayar) ? bayar : [];
    var ada = function(x){ return !!(x && x.adaBukti); };
    if (jenis === 'INV_LUNAS') {
      var pl = p.filter(function(x){ return String(x.jenis || '') === 'Pelunasan'; });
      if (pl.length) return pl.some(ada);
      return p.length > 0 && p.every(ada);
    }
    var dp = p.filter(function(x){ return String(x.jenis || '') === 'DP'; });
    return (dp.length ? dp : p).some(ada);
  }

  window.LMInvoice = { KOP: KOP, html: html, halaman: halaman, tulis: tulis, terapkanKet: terapkanKet, adaBukti: adaBukti, rp: rp, tgl: tgl };
})();
