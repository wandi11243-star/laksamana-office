/* ============================================================
   PEMBACA BERKAS .xlsx / .csv — SUMBER TUNGGAL
   ------------------------------------------------------------
   Dipakai bersama oleh modul ANALYTICS (laporan POS) dan modul JADWAL SHIFT
   (impor jadwal dari Excel).

   Dulu isinya hidup di dalam deploy/analytics/index.html. Saat modul Jadwal
   ikut perlu membaca .xlsx, satu-satunya pilihan lain adalah MENYALINNYA —
   dan dua salinan pembaca ZIP pasti lambat laun berbeda: perbaikan yang
   dikerjakan di satu modul tidak pernah sampai ke modul satunya, dan
   gejalanya berkas yang terbaca di satu layar tapi ditolak di layar sebelah.
   Repo ini sudah tiga kali kehilangan waktu karena berkas kembar yang
   tertinggal (porsiPic, potonganHari, hpp.php); yang ini dicegah sejak awal.

   Dimuat lewat <script src="../assets/xlsx-baca.js"> SEBELUM skrip modul.
   Kalau berkas ini gagal dimuat, modul yang memakainya harus MENGATAKANNYA —
   pembaca yang diam-diam tidak ada membuat setiap berkas terbaca sebagai
   "berkasnya rusak", dan yang mengunggahnya akan mencoba berkas demi berkas
   tanpa pernah tahu sebabnya. Pola yang sama dengan assets/venue-layouts.js.

   TIDAK ADA PUSTAKA. .xlsx adalah ZIP berisi XML, dan peramban modern sudah
   punya DecompressionStream('deflate-raw'); alternatifnya SheetJS ~900 KB
   dari CDN, dan CDN yang mati berarti modulnya ikut mati.
   ============================================================ */
(function (G) {
  'use strict';
  /* ============ PEMBACA BERKAS POS ============
     .xlsx adalah ZIP berisi XML. Yang perlu ditulis cuma pembaca daftar isinya;
     pengempasan deflate dikerjakan DecompressionStream milik peramban.

     Dukungan: Chrome/Edge 80+, Safari 16.4+, Firefox 113+. Yang lebih tua
     DIKATAKAN, bukan dibiarkan gagal diam-diam — berkas yang tidak terbaca
     tanpa penjelasan akan disangka berkasnya yang rusak. */
  const bisaXlsx = () => typeof DecompressionStream === 'function';

  async function inflateRaw(u8) {
    const st = new DecompressionStream('deflate-raw');
    const rs = new Blob([u8]).stream().pipeThrough(st);
    return new Uint8Array(await new Response(rs).arrayBuffer());
  }

  async function bacaZip(buf) {
    const dv = new DataView(buf);
    /* End Of Central Directory dicari DARI BELAKANG: komentar ZIP boleh sampai
       64 KB, jadi tandanya tidak selalu di 22 byte terakhir. */
    let eocd = -1;
    for (let i = dv.byteLength - 22; i >= Math.max(0, dv.byteLength - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Berkasnya bukan .xlsx (tanda ZIP tidak ketemu).');
    const jml = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const isi = {};
    for (let i = 0; i < jml; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Daftar isi ZIP rusak.');
      const metode = dv.getUint16(p + 10, true);
      const ukKompres = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true);
      const eLen = dv.getUint16(p + 30, true);
      const kLen = dv.getUint16(p + 32, true);
      const off  = dv.getUint32(p + 42, true);
      const nama = new TextDecoder().decode(new Uint8Array(buf, p + 46, nLen));
      isi[nama] = { metode, ukKompres, off };
      p += 46 + nLen + eLen + kLen;
    }
    return {
      daftar: Object.keys(isi),
      async ambil(nama) {
        const e = isi[nama];
        if (!e) return null;
        /* Panjang nama & extra di local header BOLEH berbeda dari yang di
           direktori pusat — itu sah menurut spesifikasi, dan memakai angka
           direktori untuk melompatinya adalah salah yang cuma muncul di
           sebagian berkas. */
        if (dv.getUint32(e.off, true) !== 0x04034b50) throw new Error('Header berkas di dalam ZIP rusak.');
        const nLen = dv.getUint16(e.off + 26, true);
        const eLen = dv.getUint16(e.off + 28, true);
        const mulai = e.off + 30 + nLen + eLen;
        const mentah = new Uint8Array(buf, mulai, e.ukKompres);
        const isiBytes = e.metode === 0 ? mentah : await inflateRaw(mentah);
        return new TextDecoder().decode(isiBytes);
      }
    };
  }

  const ENT_XML = { '&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&apos;':"'" };
  const unescXml = s => String(s).replace(/&(amp|lt|gt|quot|apos);/g, m => ENT_XML[m])
                                 .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

  /* Sheet XML -> array baris, tiap baris {A:'…', B:'…'}. Mendukung dua cara POS
     menyimpan teks: sharedStrings (t="s") dan inline (t="inlineStr"). Berkas
     yang diunggah user memakai inline; berkas dari POS lain memakai
     sharedStrings, dan yang cuma mengenal satu bentuk memulangkan seluruh kolom
     teks sebagai angka indeks.

     SEL KOSONG DITULIS SELF-CLOSING (`<c r="M12" s="9"/>`) — dan itu bentuk
     yang PALING SERING ada di berkas POS, bukan kasus tepi. Pola lama menuntut
     penutup `</c>`, jadi begitu ia mulai mencocokkan sel self-closing,
     pencarian penutupnya BERLANJUT KE SEL BERIKUTNYA dan menelannya utuh:
     kolom sesudah tiap kolom kosong hilang tanpa satu pun galat, dan nilainya
     terbaca sebagai kosong.

     Diukur atas kedua berkas POS Agustus 2026 (10 September 2026), dan
     akibatnya bukan cuma satu kolom:

       Detail Report  N  Visit Purpose              19.734 baris (100%)
                      AF Order Mode                 17.812 baris (90%)
                      AD Menu Code                   2.800 baris (14%)
                      AE Menu Notes                  1.913 baris (10%)
                      AB Menu                            4 baris
                      AR Total After Bill Discount       2 baris   <- UANG
       Bill Report    M  Visit Purpose               4.785 baris (100%)
                      AA Pax Total                   4.461 baris (93%)
                      AM Voucher Sales Total         4.785 baris (100%)

     DUA "fakta" yang selama ini tercatat di CLAUDE.md sebenarnya GEJALA bug
     ini, bukan bentuk datanya: (1) "Menu Code ADA tapi KOSONG di seluruh
     19.734 baris" — 2.800 baris di antaranya memang berisi; (2) "kolom Pax
     jarang terisi, cuma 318 dari 4.087 bill" — Pax Total ditelan di 93% baris.
     Keduanya sudah dibetulkan di sana.

     Yang paling berbahaya bukan Visit Purpose yang kosong seluruhnya (itu
     kelihatan), melainkan kolom UANG yang ditelan di beberapa baris saja:
     nilainya jatuh ke nol dan totalnya tetap terlihat wajar. */
  function uraiSheet(xml, ss) {
    const baris = [];
    for (const mr of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const sel = {};
      /* Dua bentuk sel dalam satu pola: self-closing, atau berpasangan.
         `[^>]*?` harus LAZY — kalau rakus, ia melewati `/>` sel ini dan
         mencari `>` di sel berikutnya, yaitu bug yang sama dengan bentuk
         lain. */
      for (const mc of mr[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tipe = (mc[2].match(/ t="([^"]*)"/) || [])[1] || 'n';
        /* Sel self-closing tidak punya isi — TETAP dicatat sebagai kosong,
           bukan dilewati: kolomnya memang ada di baris itu, dan yang membaca
           `Object.keys` untuk menghitung lebar baris tidak boleh melihatnya
           berbeda dari sel kosong berpasangan. */
        const dalam = mc[3] === undefined ? '' : mc[3];
        let v;
        if (tipe === 's') {
          const ix = (dalam.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          v = ss[+ix] !== undefined ? ss[+ix] : '';
        } else if (tipe === 'inlineStr' || tipe === 'str') {
          v = [...dalam.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('');
        } else {
          const x = (dalam.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          v = x === undefined ? '' : x;
        }
        sel[mc[1]] = unescXml(v);
      }
      baris.push(sel);
    }
    return baris;
  }

  function uraiSharedStrings(xml) {
    if (!xml) return [];
    const out = [];
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      out.push(unescXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
    }
    return out;
  }

  /* CSV: satu baris per baris, koma/titik-koma, tanda kutip ganda. Disediakan
     karena sebagian POS mengekspor CSV, dan menolak CSV berarti orangnya harus
     membukanya di Excel lalu menyimpan ulang — langkah yang setiap kali bisa
     mengubah format tanggal tanpa disadari. */
  function uraiCsvBaris(teks) {
    const pemisah = (teks.split('\n')[0].split(';').length > teks.split('\n')[0].split(',').length) ? ';' : ',';
    const out = []; let baris = [], sel = '', kutip = false;
    for (let i = 0; i < teks.length; i++) {
      const c = teks[i];
      if (kutip) {
        if (c === '"') { if (teks[i + 1] === '"') { sel += '"'; i++; } else kutip = false; }
        else sel += c;
      } else if (c === '"') kutip = true;
      else if (c === pemisah) { baris.push(sel); sel = ''; }
      else if (c === '\n') { baris.push(sel); out.push(baris); baris = []; sel = ''; }
      else if (c !== '\r') sel += c;
    }
    if (sel !== '' || baris.length) { baris.push(sel); out.push(baris); }
    /* Diubah ke bentuk berkunci huruf kolom supaya sisa kodenya tidak perlu tahu
       berkasnya datang dari .xlsx atau .csv. */
    const huruf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
    return out.map(b => { const o = {}; b.forEach((v, i) => { if (v !== '') o[huruf(i)] = v; }); return o; });
  }
  /* ---- yang dipakai bersama ---- */
  G.bisaXlsx = bisaXlsx;
  G.bacaZip = bacaZip;
  G.uraiSheet = uraiSheet;
  G.uraiSharedStrings = uraiSharedStrings;
  G.uraiCsvBaris = uraiCsvBaris;

  /* SATU BERKAS -> BARIS BERKUNCI HURUF KOLOM, apa pun bentuknya.

     Modul yang memanggilnya tidak perlu tahu berkasnya .xlsx atau .csv, dan
     tidak perlu tahu sheet mana yang dipakai — dua hal yang sebelumnya
     ditulis ulang di tiap pemakai dan jadi tempat paling mudah menyimpang.

     SHEET PERTAMA yang dipakai, bukan yang bernama tertentu: berkas jadwal
     dari HR bernama "Bar"/"Kitchen"/"Floor" sesuai divisinya, dan menuntut
     nama tertentu berarti menolak berkas yang isinya sebenarnya benar. */
  G.bacaBerkasTabel = async function (file) {
    const nama = String((file && file.name) || '').toLowerCase();
    if (/\.csv$/.test(nama)) return uraiCsvBaris(await file.text());
    if (!bisaXlsx()) throw new Error('Peramban ini belum bisa membuka .xlsx '
      + '(butuh Chrome/Edge 80+, Safari 16.4+, Firefox 113+). Simpan berkasnya sebagai CSV lalu unggah lagi.');
    const zip = await bacaZip(await file.arrayBuffer());
    const lembar = zip.daftar.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => (+(a.match(/(\d+)/) || [])[1] || 0) - (+(b.match(/(\d+)/) || [])[1] || 0));
    if (!lembar.length) throw new Error('Berkasnya tidak punya satu lembar pun.');
    const ss = uraiSharedStrings(await zip.ambil('xl/sharedStrings.xml'));
    return uraiSheet(await zip.ambil(lembar[0]), ss);
  };

  /* SELURUH LEMBAR, berikut NAMANYA — [{nama, baris}].
     -------------------------------------------------------------------
     Dipakai modul yang berkasnya memang BERLEMBAR BANYAK dan lembar mana
     yang dipakai adalah keputusan orangnya, bukan aturan tetap: berkas
     rekonsiliasi QRIS BRI menyimpan satu lembar per bulan (Jan26 … Sept26)
     di satu berkas, dan bacaBerkasTabel() di atas selalu mengambil yang
     PERTAMA — yaitu Juli, apa pun bulan yang sedang dikerjakan orangnya.
     Tanpa fungsi ini satu-satunya jalan adalah menyalin pembaca ZIP-nya ke
     modul itu, dan berkas kembar yang tertinggal sudah lima kali memakan
     waktu di repo ini.

     bacaBerkasTabel() SENGAJA tidak diubah jadi pembungkus fungsi ini: ia
     dipakai modul Analytics & Jadwal untuk berkas berlembar satu, dan
     membuatnya mengurai SELURUH lembar berarti berkas POS 9,4 MB diurai
     berkali-kali untuk lembar yang tidak pernah dibaca siapa pun.

     NAMA LEMBAR DIAMBIL DARI workbook.xml, URUTANNYA dari r:id -> rels.
     Menebaknya dari nomor berkas (sheet1.xml = lembar pertama) SALAH dan
     salahnya diam: Excel menomori berkas menurut urutan PEMBUATAN, bukan
     urutan tab. Di berkas QRIS BRI 2026 lembar ke-7 (Juni26) tersimpan
     sebagai sheet7.xml sementara lembar ke-1 (Juli26) sebagai sheet1.xml —
     jadi yang menebak akan memberi nama bulan yang keliru ke isi yang
     benar, dan tidak ada satu pun galat.

     CSV tetap dilayani: satu lembar tanpa nama. */
  G.bacaBerkasLembar = async function (file) {
    const nama = String((file && file.name) || '').toLowerCase();
    if (/\.csv$/.test(nama)) return [{ nama: 'CSV', baris: uraiCsvBaris(await file.text()) }];
    if (!bisaXlsx()) throw new Error('Peramban ini belum bisa membuka .xlsx '
      + '(butuh Chrome/Edge 80+, Safari 16.4+, Firefox 113+). Simpan berkasnya sebagai CSV lalu unggah lagi.');
    const zip = await bacaZip(await file.arrayBuffer());
    const wb = await zip.ambil('xl/workbook.xml');
    const rels = await zip.ambil('xl/_rels/workbook.xml.rels');
    /* Berkas tanpa workbook.xml atau tanpa rels-nya TIDAK dianggap rusak —
       ia cuma tidak bisa menyebut nama lembarnya. Jatuh ke urutan berkas,
       dan itu lebih baik daripada menolak berkas yang isinya benar. */
    const petaRel = {};
    if (rels) {
      const re = /Id="([^"]+)"[^>]*Target="([^"]+)"/g; let m;
      while ((m = re.exec(rels))) petaRel[m[1]] = m[2].replace(/^\/?(xl\/)?/, 'xl/');
    }
    const out = [];
    if (wb) {
      const re = /<sheet\b([^>]*)\/?>/g; let m;
      while ((m = re.exec(wb))) {
        const at = m[1];
        const nm = (at.match(/\bname="([^"]*)"/) || [])[1];
        const rid = (at.match(/r:id="([^"]*)"/) || [])[1];
        const berkas = petaRel[rid];
        if (!nm || !berkas) continue;
        out.push({ nama: unescXml(nm), berkas });
      }
    }
    if (!out.length) {
      /* Cadangan: urutkan berkas lembarnya sendiri. Namanya tidak diketahui,
         jadi disebut apa adanya — "Lembar 1" yang jujur lebih baik daripada
         nama bulan yang ditebak dan salah. */
      zip.daftar.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
        .sort((a, b) => (+(a.match(/(\d+)/) || [])[1] || 0) - (+(b.match(/(\d+)/) || [])[1] || 0))
        .forEach((n, i) => out.push({ nama: 'Lembar ' + (i + 1), berkas: n }));
    }
    if (!out.length) throw new Error('Berkasnya tidak punya satu lembar pun.');
    const ss = uraiSharedStrings(await zip.ambil('xl/sharedStrings.xml'));
    const hasil = [];
    for (const s of out) {
      const xml = await zip.ambil(s.berkas);
      /* Lembar yang disebut workbook.xml tapi berkasnya tidak ada di ZIP
         DILEWATI, bukan menjatuhkan seluruh pembacaan: satu lembar rusak
         tidak boleh membuat tiga belas lembar lain ikut tidak terbaca. */
      if (xml === null) continue;
      hasil.push({ nama: s.nama, baris: uraiSheet(xml, ss) });
    }
    if (!hasil.length) throw new Error('Tidak ada satu lembar pun yang bisa dibaca dari berkasnya.');
    return hasil;
  };

  /* BARIS BERKUNCI HURUF -> TSV, bentuk yang sama dengan hasil menyalin dari
     Excel. Dengan ini modul yang sudah punya pengurai berbasis tempelan tidak
     perlu pengurai kedua untuk berkas — satu aturan, dua cara memasukkan.

     LEBAR DIAMBIL DARI KOLOM TERJAUH DI SELURUH BERKAS, bukan per baris.
     Sel kosong di ujung baris tidak ditulis ke XML sama sekali, jadi baris
     yang berhenti lebih awal akan kehilangan kolomnya dan seluruh tanggal di
     kanannya BERGESER — jadwal orang itu pindah hari tanpa satu pun galat. */
  G.barisKeTsv = function (baris) {
    const huruf = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = (i - 1 - r) / 26; } return s; };
    const idx = h => { let n = 0; for (const c of h) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
    let lebar = 0;
    baris.forEach(b => Object.keys(b).forEach(k => { lebar = Math.max(lebar, idx(k) + 1); }));
    return baris.map(b => {
      const sel = [];
      for (let i = 0; i < lebar; i++) { const v = b[huruf(i)]; sel.push(v === undefined ? '' : String(v)); }
      return sel.join('\t');
    }).join('\n');
  };
})(window);
