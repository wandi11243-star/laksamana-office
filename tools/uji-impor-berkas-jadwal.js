/* Uji impor jadwal dari BERKAS Excel (UNGGAHAN).

   BERKAS TERPISAH dari tools/uji-impor-jadwal.js, dan itu disengaja: yang di
   sana menjaga ATURAN PENGURAINYA (tanggal harus dari tempelan bukan ditebak
   dari minggu aktif, nama di luar roster tidak ditulis, kode yang bukan shift
   jadi LAIN + catatan) dan berjalan TANPA jsdom. Yang di sini menjaga JALUR
   BERKASNYA — .xlsx dibaca, TSV disusun, lalu diserahkan ke pengurai yang
   sama. Digabung, uji pengurai yang cepat itu ikut menyeret boot jsdom setiap
   kali dijalankan.

   Uji impor jadwal dari BERKAS Excel — 7 September 2026, permintaan user:
   "saya mau import excel ini ke sistemnya; yang mingguan dan bulanan bisa,
   tapi modelnya bukan copy text tapi upload excel saja".

   YANG DIJAGA:

     - Yang ditambahkan cuma cara MEMASUKKAN data. Aturan membaca jadwalnya
       tetap imporParse() yang sudah ada — dua pengurai berarti berkas yang
       diunggah bisa menghasilkan sel berbeda dari tempelan yang isinya sama,
       dan yang membandingkannya tidak punya cara tahu mana yang benar.

     - LEBAR TSV diambil dari kolom TERJAUH di seluruh berkas. Sel kosong di
       ujung baris tidak ditulis ke XML sama sekali, jadi baris yang berhenti
       lebih awal akan kehilangan kolomnya dan seluruh tanggal di kanannya
       BERGESER — jadwal orang itu pindah hari tanpa satu pun galat. Ini
       kesalahan paling mahal di jalur ini, dan satu-satunya yang tidak
       kelihatan dari layar.

     - Memilih berkas yang SAMA dua kali tetap terbaca (input.value
       dikosongkan). Tanpa itu, memperbaiki berkasnya di Excel lalu memilih
       ulang tidak menghasilkan apa pun.

     - Pembacanya SATU, di ../assets/xlsx-baca.js, dipakai bersama modul
       Analytics. Ketiadaannya dikatakan, bukan jadi ReferenceError.

   Berkas ujinya yang ASLI dari user kalau ada di root repo; kalau tidak,
   bagian itu MELEWAT dengan jelas dan sisanya tetap jalan dengan berkas .csv
   buatan — berkas jadwal memuat nama pegawai sungguhan, jadi ia tidak
   di-commit. */
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

const ASET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'xlsx-baca.js'), 'utf8');
const HTML_ASLI = fs.readFileSync(path.join(ROOT, 'deploy', 'jadwal', 'index.html'), 'utf8');
const HTML = HTML_ASLI.replace(
  '<script src="../assets/xlsx-baca.js"><' + '/script>',
  () => '<script>' + ASET + '<' + '/script>');
if (HTML === HTML_ASLI) { console.error('tag xlsx-baca.js tidak ketemu di modul Jadwal'); process.exit(2); }

let lulus = 0, gagal = 0, lewat = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const skip = (nama, sebab) => { lewat++; console.log('  LEWAT ' + nama + '  -> ' + sebab); };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Berkas jadwal asli dari user. Tidak di-commit: memuat nama pegawai. */
function berkasAsli() {
  const f = fs.readdirSync(ROOT).find(x => /^SCHEDULE .*\.xlsx$/i.test(x));
  return f ? path.join(ROOT, f) : null;
}

function dom() {
  const d = new JSDOM(HTML, {
    url: 'https://team.laksamanamuda.id/jadwal/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true; w.print = () => {}; w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = function () {};
      /* Jalur .xlsx yang dipakai peramban dijalankan APA ADANYA — ketiganya
         ada di Node 18+, jadi yang diuji pembaca sungguhan, bukan tiruan. */
      w.DecompressionStream = DecompressionStream;
      w.Blob = Blob; w.Response = Response; w.TextDecoder = TextDecoder;
      try {
        w.localStorage.setItem('lm_session', JSON.stringify({
          expiry: Date.now() + 3600000, userId:'u-uji', name:'Penguji', token:'t-uji',
          modules:['jadwal'], adminModules:['jadwal']
        }));
      } catch (e) {}
      w.fetch = async () => ({ ok:true, status:200,
        text: async () => JSON.stringify({ ok:true, data:{} }),
        json: async () => ({ ok:true, data:{} }) });
    }
  });
  return d.window;
}
async function siap(w) {
  for (let i = 0; i < 220; i++) {
    try { if (w.eval('typeof barisKeTsv === "function" && typeof imporParse === "function"')) return; }
    catch (e) {}
    await tunggu(50);
  }
  throw new Error('modul Jadwal tidak pernah siap');
}
/* File palsu yang cukup untuk bacaBerkasTabel(): name + arrayBuffer/text. */
function fileDari(w, nama, buf) {
  return { name: nama,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8') };
}

(async () => {
  const w = dom();
  await siap(w);

  /* ============ 1. asset dipakai bersama, bukan disalin ============ */
  console.log('\n== Pembacanya satu ==');
  {
    const an = fs.readFileSync(path.join(ROOT, 'deploy', 'analytics', 'index.html'), 'utf8');
    cek('modul Jadwal memuat asset', HTML_ASLI.indexOf('../assets/xlsx-baca.js') > -1);
    cek('modul Analytics memuat asset yang SAMA', an.indexOf('../assets/xlsx-baca.js') > -1);
    /* Kalau salah satu modul menyalinnya kembali ke dalam dirinya, ini yang
       berbunyi lebih dulu. */
    cek('tidak ada salinan bacaZip di modul mana pun',
        HTML_ASLI.indexOf('async function bacaZip') < 0 && an.indexOf('async function bacaZip') < 0,
        'pembaca ZIP disalin balik ke modul — dua salinan pasti menyimpang');
    cek('ketiadaan asset dikatakan di Jadwal',
        HTML_ASLI.indexOf("typeof bacaBerkasTabel!=='function'") > -1);
    cek('...dan di Analytics', an.indexOf("typeof bacaBerkasTabel !== 'function'") > -1);
  }

  /* ============ 2. lebar TSV: kolom terjauh, bukan per baris ============ */
  console.log('\n== Lebar TSV ==');
  {
    /* Baris kedua sengaja BERHENTI LEBIH AWAL — bentuk yang benar-benar
       terjadi di berkas Excel, karena sel kosong di ujung tidak ditulis. */
    const baris = [
      { A:'Employee Name', B:'2026-09-01', C:'2026-09-02', D:'2026-09-03' },
      { A:'Ani', B:'PAGI' },
      { A:'Budi', B:'PAGI', C:'SIANG', D:'OFF' }
    ];
    const tsv = w.eval('barisKeTsv')(baris);
    const bar = tsv.split('\n');
    cek('tiap baris punya jumlah kolom yang sama',
        bar.every(b => b.split('\t').length === 4), JSON.stringify(bar.map(b => b.split('\t').length)));
    cek('baris pendek diisi sel kosong, bukan dipotong',
        bar[1] === 'Ani\tPAGI\t\t', JSON.stringify(bar[1]));
    /* Kalau lebarnya dihitung per baris, "PAGI" milik Budi akan jatuh ke
       kolom tanggal yang salah begitu ada baris yang lebih pendek. */
    cek('kolom terakhir tetap tanggal ke-3', bar[0].split('\t')[3] === '2026-09-03');
  }

  /* ============ 3. berkas ASLI user -> imporParse ============ */
  console.log('\n== Berkas Excel asli ==');
  const bp = berkasAsli();
  if (!bp) {
    skip('impor berkas asli', 'berkas SCHEDULE*.xlsx tidak ada di root repo (tidak di-commit)');
  } else {
    const buf = fs.readFileSync(bp);
    const baris = await w.eval('bacaBerkasTabel')(fileDari(w, path.basename(bp), buf));
    cek('berkasnya terbaca', Array.isArray(baris) && baris.length > 1, String(baris && baris.length));

    const tsv = w.eval('barisKeTsv')(baris);
    cek('baris pertama memuat tanggal ISO', /2026-09-01/.test(tsv.split('\n')[0]));

    /* imporParse() SUNGGUHAN dari modul, dengan roster & shift yang meniru
       setelan Bar. Nama kru diambil dari berkasnya sendiri supaya uji ini
       tidak memuat nama pegawai di dalam kodenya. */
    const namaKru = tsv.split('\n').slice(1)
      .map(b => b.split('\t')[1]).filter(x => x && /[A-Za-z]{3,}/.test(x));
    const emps = namaKru.map((n, i) => ({ id:'e' + i, name:n }));
    const shifts = {
      PAGI:{ n:'Pagi', m:'08:00', s:'16:00' },
      SIANG:{ n:'Siang', m:'14:00', s:'22:00' },
      MIDDLE:{ n:'Middle', m:'11:00', s:'19:00' },
      OFF:{ n:'dayoff', libur:1 }
    };
    const hasil = w.eval('imporParse')(tsv, { emps, shifts, ref:'2026-09-15' });

    cek('barisnya ada di berkas & tanggalnya terbaca', hasil.adaTgl === true);
    cek('seluruh kru di berkas cocok', hasil.cocok.length === emps.length,
        hasil.cocok.length + ' dari ' + emps.length + ' · lewat: ' + JSON.stringify(hasil.lewat));
    cek('tidak ada nama yang gagal dicocokkan', hasil.lewat.length === 0, JSON.stringify(hasil.lewat));
    /* "dayoff" harus jatuh ke kode OFF lewat nama shift-nya, BUKAN jadi shift
       bebas bernama "dayoff" — kalau bebas, lembar jadwalnya penuh sel
       bertuliskan teks mentah dan tidak satu pun terbaca sebagai libur. */
    cek('"dayoff" dikenali sebagai OFF, bukan shift bebas',
        hasil.bebas.indexOf('dayoff') < 0, JSON.stringify(hasil.bebas));
    const off = hasil.rows.filter(r => r.t === 'OFF').length;
    cek('ada baris OFF yang tercatat', off > 0, String(off));
    /* Sebulan penuh sekaligus: itu yang diminta user ("mingguan dan bulanan"). */
    const tglUnik = [...new Set(hasil.rows.map(r => r.d))].sort();
    cek('sebulan penuh terbaca sekaligus', tglUnik.length >= 28,
        tglUnik.length + ' tanggal: ' + tglUnik[0] + ' .. ' + tglUnik[tglUnik.length - 1]);
    cek('seluruh tanggal masih di bulan yang sama',
        tglUnik.every(t => t.slice(0, 7) === tglUnik[0].slice(0, 7)),
        JSON.stringify(tglUnik.filter(t => t.slice(0, 7) !== tglUnik[0].slice(0, 7))));
    cek('tiap kru punya barisnya sendiri',
        [...new Set(hasil.rows.map(r => r.u))].length === emps.length);
  }

  /* ============ 4. CSV tetap jalan ============ */
  console.log('\n== Jalur CSV ==');
  {
    const csv = 'Employee Name,2026-09-01,2026-09-02\nAni,PAGI,OFF\nBudi,SIANG,SIANG\n';
    const baris = await w.eval('bacaBerkasTabel')(fileDari(w, 'jadwal.csv', Buffer.from(csv, 'utf8')));
    const tsv = w.eval('barisKeTsv')(baris);
    const hasil = w.eval('imporParse')(tsv, {
      emps:[{ id:'a', name:'Ani' }, { id:'b', name:'Budi' }],
      shifts:{ PAGI:{ n:'Pagi', m:'08:00', s:'16:00' }, SIANG:{ n:'Siang', m:'14:00', s:'22:00' },
               OFF:{ n:'dayoff', libur:1 } },
      ref:'2026-09-15' });
    cek('CSV terbaca lewat pembaca yang sama', hasil.rows.length === 4, String(hasil.rows.length));
    cek('...dan shift-nya benar',
        hasil.rows.some(r => r.u === 'a' && r.d === '2026-09-01' && r.t === 'PAGI'));
  }

  /* ============ 5. bentuk UI-nya ============ */
  console.log('\n== Bentuk layarnya ==');
  {
    cek('modalnya bernama Impor, bukan Tempel', HTML_ASLI.indexOf('<h3>Impor dari Excel</h3>') > -1);
    cek('tombolnya juga', HTML_ASLI.indexOf('📥 Impor dari Excel') > -1);
    cek('ada kotak pilih berkas .xlsx/.csv', HTML_ASLI.indexOf('accept=".xlsx,.csv"') > -1);
    /* Menempel TIDAK dicabut — jadwal yang disusun di Google Sheets tidak
       selalu berbentuk berkas, dan mencabutnya menghilangkan satu-satunya
       jalan untuk kasus itu. Ia cuma dilipat. */
    cek('menempel tetap ada sebagai cadangan', HTML_ASLI.indexOf('Atau tempel dari papan ketik') > -1);
    cek('input file dikosongkan supaya berkas sama bisa dipilih ulang',
        /input\.value='';/.test(HTML_ASLI));
    cek('nama berkas digambar terpisah, tidak menggambar ulang modal',
        HTML_ASLI.indexOf('function imporNamaGambar(') > -1);
  }

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal + (lewat ? '   LEWAT ' + lewat : ''));
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
