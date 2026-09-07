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
     teks sebagai angka indeks. */
  function uraiSheet(xml, ss) {
    const baris = [];
    for (const mr of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const sel = {};
      for (const mc of mr[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
        const tipe = (mc[2].match(/ t="([^"]*)"/) || [])[1] || 'n';
        const dalam = mc[3];
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
