/************************************************************************
 * LEMBAR KWITANSI — SATU BERKAS, DIPAKAI DUA MODUL (21 Agustus 2026)
 * ---------------------------------------------------------------------
 * Sampai hari ini lembar kwitansi hidup di dalam deploy/reservasi/index.html
 * dan hanya bisa dicetak dari sana. Tim meminta lembar yang sama juga bisa
 * dicetak dari Marketing (Reservasi VIP).
 *
 * KENAPA BERKAS BERSAMA, BUKAN DISALIN
 * Menyalin fungsinya ke modul Marketing berarti dua lembar kwitansi untuk
 * satu perusahaan. Keduanya akan diperbaiki sendiri-sendiri — nomor rekening
 * berubah, alamat berubah, tata letak tanda tangan berubah — dan yang tidak
 * ikut diperbaiki tetap tercetak, dipegang tamu, tanpa ada yang menyadarinya
 * sampai ada yang membandingkan dua lembar berdampingan. Itu persis kegagalan
 * sunyi yang paling mahal: yang salah bukan layarnya, tapi kertas yang sudah
 * keluar.
 *
 * SENGAJA TIDAK BERGANTUNG PADA APA PUN DARI MODUL PEMANGGIL.
 * Berkas ini membawa esc() dan rp()-nya sendiri, dan menerima DATA DATAR —
 * bukan record reservasi, bukan record VIP. Dua modul itu menyimpan datanya
 * dengan bentuk yang sama sekali berbeda, dan seandainya berkas ini menerima
 * salah satunya, modul yang lain harus memalsukan bentuk record modul
 * tetangga hanya untuk bisa mencetak. Pemetaannya dikerjakan pemanggil, di
 * tempat yang memang mengenal datanya.
 *
 * Dimuat lewat <script src="../assets/kwitansi-sheet.js"> di kedua modul,
 * dan ikut ter-deploy karena seluruh isi deploy/ diunggah workflow.
 ************************************************************************/
(function(){
  var KOP_BAWAAN = {
    pt: "PT. LAKSAMANA MUDA BERSATU",
    alamat: "Jl. Soekarno - Hatta No. 39, Labuh Baru Tim, Kec. Payung Sekaki,<br>Kota Pekanbaru, Riau 28282",
    bank: "UOB | PT. Laksamana Muda Bersatu",
    rek: "319-303-3588",
    ttdNama: "(Wandi Pranata)",
    ttdJabatan: "Finance"
  };

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  /* Bentuknya "Rp. 1.000.000" — sama persis dengan rpDot() di modul Reservasi,
     karena lembar yang tercetak sebelum dan sesudah pemindahan ini harus tidak
     bisa dibedakan. */
  function rp(n){ n = Number(n) || 0; return "Rp. " + n.toLocaleString("id-ID"); }

  /* d = data datar. Yang WAJIB cuma `nama` dan `total`; sisanya punya jalan
     mundur masing-masing, supaya satu field yang lupa diisi pemanggil tidak
     pernah menghasilkan lembar yang gagal tercetak — paling jauh satu baris
     yang berbunyi "-".

       no            nomor dokumen (invoice resmi Finance, atau nomor internal)
       resmi         true = sudah diterbitkan Finance (mengubah label No.)
       lunas         true = lembar PELUNASAN, false = PEMBAYARAN DP
       nama, hp, metode
       tanggalTerbit sudah TERFORMAT oleh pemanggil (tiap modul punya fmtDate
                     sendiri, dan memformat tanggal di sini berarti format
                     ketiga yang bisa berbeda dari dua layar yang memanggilnya)
       keterangan    baris utama tabel, mis. "Reservasi Corporate / Gathering"
       subKeterangan baris kecil di bawahnya: tanggal · jam · meja
       pax
       total         angka
       penanda       [{nama,jabatan,ttd}] — ttd berupa data URI, boleh kosong
       cap           data URI cap perusahaan, dibubuhkan di penanda PERTAMA
       logo          data URI logo untuk kop
       kop           penimpa sebagian KOP_BAWAAN (opsional)
       sumber        disebut di kaki lembar: "reservasi" / "marketing" */
  function html(d){
    d = d || {};
    var kop = {}; var k;
    for (k in KOP_BAWAAN) kop[k] = KOP_BAWAAN[k];
    if (d.kop) for (k in d.kop) if (d.kop[k]) kop[k] = d.kop[k];

    var lunas = !!d.lunas;
    var resmi = !!d.resmi;
    var total = Number(d.total) || 0;
    /* Tanpa penanda tangan resmi, jatuh ke SATU blok berisi nama bawaan di
       kop — bukan blok kosong. Tata letak bagian bawah lembar jadi tidak
       melompat antara versi bertanda tangan dan yang belum. */
    var pen = (Array.isArray(d.penanda) && d.penanda.length)
      ? d.penanda
      : [{nama: kop.ttdNama, jabatan: kop.ttdJabatan, ttd: ""}];

    var baris = function(a, b){
      return '<tr><td class="k">' + esc(a) + '</td><td class="v">' + b + '</td></tr>';
    };

    return '<!doctype html><html><head><meta charset="utf-8"><title>Kwitansi ' +
      esc(d.no || "") + ' — ' + esc(d.nama || "") + '</title>\n' +
'<style>\n' +
'  *{box-sizing:border-box;margin:0;padding:0}\n' +
'  body{font:13px/1.55 "Segoe UI",Arial,sans-serif;color:#1d1a15;background:#fff;padding:28px 30px}\n' +
'  .kop{display:flex;align-items:flex-start;gap:18px;border-bottom:3px solid #C9A227;padding-bottom:14px}\n' +
'  .kop img{width:74px;height:74px;object-fit:contain;flex:none}\n' +
'  .kop .pt{font-size:17px;font-weight:800;letter-spacing:.2px}\n' +
'  .kop .al{font-size:11.5px;color:#5c574d;margin-top:4px}\n' +
'  .judul{margin-left:auto;text-align:right;flex:none}\n' +
'  .judul b{font-size:22px;letter-spacing:2px;display:block}\n' +
'  .judul span{font-size:11px;color:#5c574d;letter-spacing:1px}\n' +
'  .meta{display:flex;justify-content:space-between;gap:24px;margin:18px 0 16px}\n' +
'  .meta table{border-collapse:collapse}\n' +
'  .meta td{padding:2px 0;font-size:12.5px;vertical-align:top}\n' +
'  .meta td.k{color:#5c574d;padding-right:10px;white-space:nowrap}\n' +
'  .meta td.v{font-weight:600}\n' +
'  .lunas{display:inline-block;border:2px solid ' + (lunas ? "#1F9D5F" : "#C9A227") + ';color:' + (lunas ? "#1F9D5F" : "#8a6a12") + ';\n' +
'    font-weight:800;font-size:12px;letter-spacing:1.5px;padding:5px 12px;border-radius:6px;transform:rotate(-3deg)}\n' +
'  table.isi{width:100%;border-collapse:collapse;margin-top:6px}\n' +
'  table.isi th{background:#F4EEE0;border:1px solid #D9CDB2;padding:8px;font-size:11.5px;letter-spacing:.4px;text-transform:uppercase}\n' +
'  table.isi td{border:1px solid #D9CDB2;padding:9px 8px;font-size:12.5px}\n' +
'  .num{text-align:right;white-space:nowrap}\n' +
'  .tot td{background:#FAF6EC;font-weight:800;font-size:13.5px}\n' +
'  .bawah{display:flex;justify-content:space-between;gap:30px;margin-top:24px}\n' +
'  .bayar{border:1px solid #D9CDB2;border-radius:8px;padding:11px 13px;font-size:12px;max-width:290px}\n' +
'  .bayar b{display:block;margin-bottom:3px}\n' +
'  .ttd{text-align:center;font-size:12.5px;min-width:190px}\n' +
'  .ttd-grup{text-align:right;font-size:12.5px}\n' +
'  .ttd-baris{display:flex;gap:20px;justify-content:flex-end;align-items:flex-end}\n' +
'  .ttd-baris .ttd{min-width:150px}\n' +
'  .ttd .sp{height:58px}\n' +
'  .ttd .nm{border-top:1px solid #1d1a15;padding-top:5px;font-weight:700;display:inline-block;min-width:170px}\n' +
'  .catatan{margin-top:20px;font-size:11px;color:#5c574d;border-top:1px dashed #D9CDB2;padding-top:9px}\n' +
'  @page{size:A4;margin:12mm}\n' +
'  @media print{body{padding:0}.noprint{display:none}}\n' +
'  .noprint{margin-top:22px;text-align:center}\n' +
'  .noprint button{font:600 13px/1 "Segoe UI",Arial;padding:10px 18px;border-radius:8px;border:0;background:#C9A227;color:#2a2620;cursor:pointer}\n' +
'</style></head><body>\n' +
'  <div class="kop">\n' +
'    <img src="' + esc(d.logo || "") + '" alt="">\n' +
'    <div><div class="pt">' + esc(kop.pt) + '</div><div class="al">' + kop.alamat + '</div></div>\n' +
'    <div class="judul"><b>KWITANSI</b><span>' + (lunas ? "PELUNASAN" : "PEMBAYARAN DP") + '</span></div>\n' +
'  </div>\n' +
'  <div class="meta">\n' +
'    <table>\n' +
      baris("Diterima dari", '<b>' + esc(String(d.nama || "-").toUpperCase()) + '</b>') +
      (d.hp ? baris("No. HP", esc(d.hp)) : "") +
      baris("Untuk", lunas ? "Pelunasan Reservasi" : "Down Payment (DP) Reservasi") +
'    </table>\n' +
'    <table>\n' +
      baris(resmi ? "No. Invoice" : "No. Kwitansi", '<b>' + esc(d.no || "-") + '</b>') +
      baris("Tanggal Terbit", esc(d.tanggalTerbit || "-")) +
      baris("Metode Bayar", esc(d.metode || "-")) +
'    </table>\n' +
'  </div>\n' +
'  <table class="isi">\n' +
'    <thead><tr><th style="width:38px">No</th><th style="text-align:left">Keterangan</th><th style="width:60px">Pax</th><th style="width:130px">Jumlah</th></tr></thead>\n' +
'    <tbody>\n' +
'      <tr><td class="num">1</td>\n' +
'        <td>' + esc(d.keterangan || "Reservasi") + '<br>\n' +
'          <span style="color:#5c574d;font-size:11.5px">' + esc(d.subKeterangan || "") + '</span></td>\n' +
'        <td class="num">' + esc(String(d.pax || "-")) + '</td>\n' +
'        <td class="num">' + esc(rp(total)) + '</td></tr>\n' +
'      <tr class="tot"><td colspan="3" class="num">TOTAL DITERIMA</td><td class="num">' + esc(rp(total)) + '</td></tr>\n' +
'    </tbody>\n' +
'  </table>\n' +
'  <div class="bawah">\n' +
'    <div>\n' +
'      <div class="bayar"><b>Pembayaran dapat ditransfer ke:</b>' + esc(kop.bank) + '<br><b style="margin-top:3px">' + esc(kop.rek) + '</b></div>\n' +
'      <div style="margin-top:12px"><span class="lunas">' + (lunas ? "LUNAS" : "DP DITERIMA") + '</span></div>\n' +
'    </div>\n' +
'    <div class="ttd-grup">Hormat Kami,\n' +
'      <div class="ttd-baris">\n' +
        pen.map(function(p, i){
          /* CAP dibubuhkan di penanda tangan PERTAMA saja, setengah menimpa
             tanda tangan & garis nama — seperti cap basah di atas kertas.
             Satu cap untuk satu lembar, bukan satu per orang. */
          return '<div class="ttd">' +
            '<div class="sp" style="position:relative">' +
              ((d.cap && i === 0) ? '<img src="' + esc(d.cap) + '" alt="" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-38%) rotate(-8deg);height:96px;opacity:.85">' : "") +
              (p.ttd ? '<img src="' + esc(p.ttd) + '" alt="" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-46%);height:64px">' : "") +
            '</div>' +
            '<div class="nm">' + esc(p.nama || "") + '</div>' +
            '<div style="color:#5c574d;font-size:11.5px">' + esc(p.jabatan || "") + '</div>' +
          '</div>';
        }).join("") +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="catatan">' + (lunas
      ? "Pembayaran reservasi ini telah <b>LUNAS</b>. Mohon simpan kwitansi ini sebagai bukti pembayaran."
      : "DP ini akan <b>memotong total tagihan</b> saat tamu datang. Mohon simpan kwitansi ini sebagai bukti pembayaran.") + '\n' +
'    <br>Dokumen ini dicetak dari sistem Laksamana Muda dan sah tanpa tanda tangan basah.</div>\n' +
'  <div class="noprint"><button onclick="window.print()">🖨️ Simpan sebagai PDF / Cetak</button></div>\n' +
'</body></html>';
  }

  /* Menulis lembar ke jendela yang SUDAH dibuka pemanggil, lalu memanggil
     dialog cetak. Jendelanya dibuka pemanggil — bukan di sini — karena
     window.open() harus berada di dalam gestur klik; begitu ada satu await
     sebelum itu, peramban memblokirnya sebagai popup dan yang terlihat cuma
     tidak terjadi apa-apa.

     Jeda 400ms sebelum print(): tanpa itu dialog cetak memotret dokumen yang
     logo & fontnya belum selesai dimuat, dan PDF-nya keluar tanpa kop. */
  function tulis(w, d){
    try{
      w.document.open();
      w.document.write(html(d));
      w.document.close();
    }catch(e){ return false; }   // jendelanya keburu ditutup orangnya
    w.onload = function(){
      setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 400);
    };
    return true;
  }

  window.LMKwitansi = { KOP: KOP_BAWAAN, html: html, tulis: tulis, rp: rp };
})();
