/* Uji halaman Investor Compass di jsdom dengan account-api & kompas-api tiruan.
   Yang diperiksa: gerbang modul, sesi mati, keadaan kosong, dan angka KPI. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

const HTML = fs.readFileSync(path.join(ROOT, 'investor', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function buatRingkas(over) {
  return Object.assign({
    ts: '2026-08-27T09:00:00+00:00',
    hariIni:  { tgl:'2026-08-27', omset: 20000000, transaksi: 120 },
    kemarin:  { tgl:'2026-08-26', omset: 16000000 },
    bulanIni: { kunci:'2026-08', omset: 400000000, transaksi: 2000, hariTerisi: 26, target: 500000000 },
    bulanLalu:{ kunci:'2026-07', omset: 310000000, hariTerisi: 31 },
    tahunan:  { '2025': new Array(12).fill(25000000), '2026': [1,2,3,4,5,6,7,8].map(n=>n*1e7).concat([null,null,null,null]) },
    harian:   Array.from({length:30}, (_,i) => ({ tgl:'2026-08-' + String(i+1).padStart(2,'0'), omset: i < 26 ? (10 + i) * 1e6 : null })),
    terakhir: '2026-08-26',
    adaData:  true
  }, over || {});
}

async function jalankan(nama, opt) {
  console.log('\n== ' + nama + ' ==');
  const panggilan = [];
  const dom = new JSDOM(HTML, {
    url: opt.url || 'https://investor.laksamanamuda.id/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      // Chart.js datang dari CDN — jsdom tidak mengambilnya. Diganti boneka
      // yang mencatat saja; yang diuji di sini datanya, bukan gambarnya.
      w.Chart = function (ctx, cfg) { this.cfg = cfg; w.__charts = (w.__charts || []).concat([cfg]); };
      w.Chart.prototype.destroy = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({});
      w.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        panggilan.push({ url, body });
        const jawab = opt.api(body, url);
        return { json: async () => jawab };
      };
      if (opt.sesiTersimpan) {
        try { w.localStorage.setItem('lm_investor_sesi', JSON.stringify(opt.sesiTersimpan)); } catch (e) {}
      }
    }
  });
  const w = dom.window;
  await tunggu(60);
  if (opt.aksi) { await opt.aksi(w); await tunggu(120); }
  await tunggu(120);
  opt.periksa(w, panggilan, dom);
  dom.window.close();
}

(async () => {
  const $ = (w, id) => w.document.getElementById(id);
  const terlihat = (w, id) => !$(w, id).classList.contains('hidden');

  // ---- 1. belum login: layar masuk, dan TIDAK ada permintaan ke server ----
  await jalankan('Boot tanpa sesi', {
    api: () => ({ ok:false }),
    periksa(w, p) {
      cek('layar masuk tampil', terlihat(w, 'login'));
      cek('aplikasi tersembunyi', !terlihat(w, 'app'));
      cek('tidak memanggil server', p.length === 0, p.length + ' panggilan');
      cek('tidak ada kata sandi demo di layar', !w.document.body.innerHTML.includes('laksamana2026'));
    }
  });

  // ---- 2. login benar tapi TANPA kunci modul investor ----
  await jalankan('Login tanpa kunci modul', {
    api: b => b.action === 'login'
      ? { ok:true, user:{ id:'u1', name:'Kasir A', modules:['kompas'], adminModules:[], token:'T1' } }
      : { ok:false, error:'x' },
    async aksi(w) {
      $(w,'nm').value = 'Kasir A'; $(w,'pw').value = '1111';
      w.doLogin();
    },
    periksa(w, p) {
      cek('tetap di layar masuk', terlihat(w, 'login'));
      cek('pesan menyebut Investor Compass', $(w,'loginErr').innerHTML.includes('Investor Compass'),
          $(w,'loginErr').innerHTML);
      cek('tidak menyimpan sesi', !w.localStorage.getItem('lm_investor_sesi'));
      cek('tidak memanggil kompas-api', !p.some(x => x.body.action === 'investorRingkas'));
    }
  });

  // ---- 3. login benar + berhak: KPI terisi dari data sungguhan ----
  await jalankan('Login berhak, data ada', {
    api: b => {
      if (b.action === 'login') return { ok:true, user:{ id:'u2', name:'Bpk. Andi', modules:['investor'], adminModules:[], token:'T2' } };
      if (b.action === 'investorRingkas') return { ok:true, data: buatRingkas() };
      return { ok:false };
    },
    async aksi(w) { $(w,'nm').value='Bpk. Andi'; $(w,'pw').value='2222'; w.doLogin(); },
    periksa(w, p) {
      cek('aplikasi tampil', terlihat(w, 'app'));
      cek('nama investor dari server', $(w,'invName').textContent === 'Bpk. Andi', $(w,'invName').textContent);
      cek('token ikut dikirim ke kompas-api',
          p.some(x => x.body.action === 'investorRingkas' && x.body.sesi === 'T2'));
      const kp = $(w,'kpis').innerHTML;
      cek('KPI omset hari ini Rp 20.000.000', kp.includes('Rp 20.000.000'), kp.slice(0, 200));
      cek('delta hari ini +25.0%', kp.includes('25.0%'));
      // rata-rata/hari: 400jt/26 = 15,38jt ; bulan lalu 310jt/31 = 10jt -> +53.8%
      cek('delta bulan pakai rata-rata harian (53.8%)', kp.includes('53.8%'), 'harus 53.8, bukan 29.0');
      cek('KPI transaksi 2.000', kp.includes('2.000'));
      cek('rata-rata/transaksi Rp 200.000', kp.includes('Rp 200.000'));
      cek('80% dari target', kp.includes('80% dari target'));
      cek('catatan tanggal data terakhir', $(w,'sumberNote').innerHTML.includes('26 Agu 2026'), $(w,'sumberNote').innerHTML);
      cek('bukan label server dev di domain produksi', !$(w,'sumberNote').innerHTML.includes('server dev'));
      cek('tombol tahun terbangun', $(w,'yearToggle').querySelectorAll('button').length === 2);
      cek('grafik digambar', (w.__charts || []).length === 2, String((w.__charts || []).length));
      const bar = (w.__charts || [])[1];
      cek('grafik harian 30 titik', bar && bar.data.labels.length === 30);
      cek('hari kosong jadi null, bukan 0', bar && bar.data.datasets[0].data[29] === null);
      cek('sorotan hari terbaik ada', $(w,'highlights').innerHTML.includes('Hari terbaik'));
      // tab yang belum punya sumber
      ['dividenBox','laporanBox','programBox','eventBox','bukuBox'].forEach(id =>
        cek(id + ' berisi keadaan kosong', $(w,id).innerHTML.includes('kosong'), $(w,id).innerHTML.slice(0,80)));
      cek('tidak ada angka dividen karangan', !$(w,'dividenBox').innerHTML.includes('Rp'));
    }
  });

  // ---- 4. sesi tersimpan sudah mati -> balik ke layar masuk, sesi dibuang ----
  await jalankan('Sesi tersimpan sudah kedaluwarsa', {
    sesiTersimpan: { token:'LAMA', nama:'Bpk. Andi' },
    api: b => b.action === 'investorRingkas'
      ? { ok:false, error:'sesi_tidak_sah: Sesi Anda tidak dikenali atau sudah berakhir.' }
      : { ok:false },
    periksa(w, p) {
      cek('kembali ke layar masuk', terlihat(w, 'login'));
      cek('aplikasi disembunyikan lagi', !terlihat(w, 'app'));
      cek('sesi lama dibuang', !w.localStorage.getItem('lm_investor_sesi'));
      cek('pesannya menyuruh masuk lagi', $(w,'loginErr').innerHTML.includes('masuk lagi'), $(w,'loginErr').innerHTML);
    }
  });

  // ---- 5. sesi sah tapi aksesnya dicabut -> TIDAK disuruh login ulang ----
  await jalankan('Akses dicabut setelah masuk', {
    sesiTersimpan: { token:'T3', nama:'Bpk. Andi' },
    api: b => b.action === 'investorRingkas'
      ? { ok:false, error:'tanpa_modul: Akun Anda belum diberi akses modul ini.' }
      : { ok:false },
    periksa(w) {
      cek('tetap di aplikasi (bukan layar masuk)', terlihat(w, 'app'));
      cek('menjelaskan aksesnya, bukan sesinya', $(w,'kpis').innerHTML.includes('belum diberi akses'),
          $(w,'kpis').innerHTML.slice(0, 200));
    }
  });

  // ---- 6. berhak tapi database masih kosong ----
  await jalankan('Database omset kosong', {
    sesiTersimpan: { token:'T4', nama:'Bpk. Andi' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({ adaData:false, terakhir:null, tahunan:{}, hariIni:{tgl:'2026-08-27',omset:null,transaksi:null},
            kemarin:{tgl:'2026-08-26',omset:null}, bulanIni:{kunci:'2026-08',omset:0,transaksi:0,hariTerisi:0,target:0},
            bulanLalu:{kunci:'2026-07',omset:0,hariTerisi:0},
            harian: Array.from({length:30},(_,i)=>({tgl:'2026-08-'+String(i+1).padStart(2,'0'),omset:null})) }) }
      : { ok:false },
    periksa(w) {
      cek('KPI memajang keadaan kosong', $(w,'kpis').innerHTML.includes('Belum ada omset yang tercatat'));
      cek('menyebutkan Input Omset Harian', $(w,'kpis').innerHTML.includes('Input Omset Harian'));
      cek('tidak menggambar grafik', !(w.__charts || []).length);
      cek('tidak ada Rp palsu di KPI', !$(w,'kpis').innerHTML.includes('Rp '));
    }
  });

  // ---- 7. host dev menembak Office dev, bukan produksi ----
  await jalankan('Host dev menembak Office dev', {
    url: 'https://dev.investor.laksamanamuda.id/',
    sesiTersimpan: { token:'T5', nama:'Uji' },
    api: b => b.action === 'investorRingkas' ? { ok:true, data: buatRingkas() } : { ok:false },
    periksa(w, p) {
      const u = p.map(x => x.url).join(' ');
      cek('memanggil dev.laksamanamuda.id', u.includes('https://dev.laksamanamuda.id/kompas-api-mysql/api.php'), u);
      cek('tidak menyentuh team.laksamanamuda.id', !u.includes('team.laksamanamuda.id'), u);
      cek('ditandai server dev di layar', $(w,'sumberNote').innerHTML.includes('server dev'));
    }
  });

  // ---- 8. bulan lalu cuma 1 hari terisi -> delta bulan TIDAK digambar ----
  //  Data produksi 27 Agu 2026 memang begitu: Juli punya satu baris uji.
  await jalankan('Pembanding bulan lalu terlalu sedikit', {
    sesiTersimpan: { token:'T6', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({ bulanLalu:{ kunci:'2026-07', omset: 70000000, hariTerisi: 1 } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('delta hari ini tetap digambar', kp.includes('25.0%'));
      cek('delta bulan TIDAK digambar', !kp.includes('rata-rata/hari vs'), kp.slice(0,400));
      cek('tidak menulis turun 70%', !kp.includes('70.0%'));
      cek('total bulan tetap tampil', kp.includes('Rp 400.000.000'));
    }
  });

  // ---- 9. keterangan NET vs Dibayar Tamu ----
  //  Angka aslinya 27 Agu 2026: net 546.005.454 + svc 26.180.768 + tax
  //  49.849.650 = dibayar tamu 622.035.872 (kartu Rekap Penjualan).
  await jalankan('Keterangan net vs dibayar tamu', {
    sesiTersimpan: { token:'T7', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({
          bulanIni:{ kunci:'2026-08', omset:546005454, transaksi:3996, hariTerisi:26,
                     svc:26180768, pajak:49849650, dibayarTamu:622035872, target:1000000000 },
          hariIni: { tgl:'2026-08-27', omset:null, transaksi:null, svc:null, pajak:null, dibayarTamu:null } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('angka besar tetap net', kp.includes('Rp 546.005.454'));
      cek('menyebut dibayar tamu', kp.includes('Rp 622.035.872'), kp.slice(0,600));
      cek('menyebut service', kp.includes('service Rp 26 jt'), kp.slice(0,600));
      cek('menyebut pajak', kp.includes('pajak Rp 50 jt'), kp.slice(0,600));
      cek('55% dari target', kp.includes('55% dari target'));
      // hari ini kosong -> tidak ada keterangan net yang membingungkan
      const kartuHariIni = kp.split('<div class="kpi rise">')[1] || '';
      cek('kartu hari ini tanpa keterangan net', !kartuHariIni.includes('dibayar tamu'), kartuHariIni.slice(0,300));
    }
  });

  // ---- 10. service & pajak nol -> baris keterangan TIDAK digambar ----
  await jalankan('Service & pajak belum diisi', {
    sesiTersimpan: { token:'T8', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({
          bulanIni:{ kunci:'2026-08', omset:400000000, transaksi:2000, hariTerisi:26,
                     svc:0, pajak:0, dibayarTamu:400000000, target:500000000 } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('tidak ada baris net-ket', !kp.includes('net-ket'), kp.slice(0,400));
      cek('tidak menulis "dibayar tamu"', !kp.includes('dibayar tamu'));
      cek('angka omset tetap tampil', kp.includes('Rp 400.000.000'));
    }
  });

  // ---- 11. Laporan Laba Rugi: blok pendapatan terisi, sisanya kosong ----
  //  Angka contoh diambil dari Profit Loss Report Juni 2026 milik CFO supaya
  //  susunannya bisa dibandingkan baris demi baris dengan laporan aslinya.
  const LR_JUNI = {
    kunci:'2026-06', food:351332881, bev:299223830, lainnya:16494108,
    pb1:67180225, service:33590113, totalSales:767821157,
    diskon:6629174, compliment:17953321, totalDiskon:24582495,
    netSales:743238662, hariTerisi:30
  };
  await jalankan('Laporan laba rugi', {
    sesiTersimpan: { token:'T9', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({ labaRugi:[ LR_JUNI,
            { kunci:'2026-05', food:1, bev:0, lainnya:0, pb1:0, service:0, totalSales:1,
              diskon:0, compliment:0, totalDiskon:0, netSales:1, hariTerisi:1 } ] }) }
      : { ok:false },
    periksa(w) {
      const lp = $(w,'laporanBox').innerHTML;
      cek('Sales - Food terisi', lp.includes('Rp 351.332.881'), lp.slice(0,300));
      cek('Sales - Beverage terisi', lp.includes('Rp 299.223.830'));
      cek('Income PB 1 terisi', lp.includes('Rp 67.180.225'));
      cek('Income Service Charge terisi', lp.includes('Rp 33.590.113'));
      cek('Total Sales terisi', lp.includes('Rp 767.821.157'));
      cek('Compliment jadi baris sendiri', lp.includes('Compliment') && lp.includes('Rp 17.953.321'));
      cek('diskon digambar dalam kurung', lp.includes('(Rp 24.582.495)'), lp.slice(0,900));
      cek('Net Sales terisi', lp.includes('Rp 743.238.662'));

      // baris tanpa sumber HARUS kosong, bukan nol
      ['Total Cost of Goods Sold','Gross Profit','Total Operational Expense',
       'Operational Profit/Loss','Earning Before Interest & Tax','Earning Before Tax',
       'Net Profit / (Net Loss)'].forEach(n =>
        cek('"' + n + '" ada di susunan', lp.includes(n.replace(/&/g,'&amp;'))));
      // Dihitung dari penanda BARIS (span.lr-belum), bukan dari teksnya:
      // kalimat catatan di bawah tabel memakai frasa yang sama, dan menghitung
      // teks polos membuat assertion ini melaporkan 11 untuk 10 baris.
      const jml = (lp.match(/class="lr-belum"/g) || []).length;
      cek('10 baris ditandai belum ada inputnya', jml === 10, 'ketemu ' + jml);
      cek('tidak ada Rp 0 palsu di blok beban', !lp.includes('Rp 0'), lp.slice(-900));

      cek('peringatan Net Sales bukan laba', lp.includes('Net Sales bukan laba'));
      cek('menyebut jumlah hari terisi', lp.includes('30 hari yang terisi'), lp.slice(-500));

      const opt = $(w,'lrBulan').querySelectorAll('option');
      cek('pemilih bulan berisi 2 bulan', opt.length === 2, String(opt.length));
      cek('bulan terbaru terpilih duluan', $(w,'lrBulan').value === '2026-06', $(w,'lrBulan').value);
    }
  });

  // ---- 12. ganti bulan ----
  await jalankan('Ganti bulan di laporan', {
    sesiTersimpan: { token:'T10', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({ labaRugi:[
            { kunci:'2026-08', food:100, bev:0, lainnya:0, pb1:0, service:0, totalSales:100,
              diskon:0, compliment:0, totalDiskon:0, netSales:100, hariTerisi:26 },
            { kunci:'2026-07', food:70000000, bev:0, lainnya:0, pb1:0, service:0, totalSales:70000000,
              diskon:0, compliment:0, totalDiskon:0, netSales:70000000, hariTerisi:1 } ] }) }
      : { ok:false },
    async aksi(w) { w.lrGanti('2026-07'); },
    periksa(w) {
      const lp = $(w,'laporanBox').innerHTML;
      cek('pindah ke Juli', lp.includes('Rp 70.000.000'), lp.slice(0,300));
      cek('angka Agustus tidak ikut', !lp.includes('Rp 100<'), lp.slice(0,300));
      cek('catatan ikut berganti', lp.includes('1 hari yang terisi'), lp.slice(-400));
    }
  });

  // ---- 13. belum ada omset sama sekali ----
  await jalankan('Laporan tanpa data omset', {
    sesiTersimpan: { token:'T11', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({ labaRugi: [] }) }
      : { ok:false },
    periksa(w) {
      const lp = $(w,'laporanBox').innerHTML;
      cek('keadaan kosong tampil', lp.includes('Belum ada omset yang bisa disusun'), lp.slice(0,200));
      cek('menyebut Input Omset Harian', lp.includes('Input Omset Harian'));
      cek('pemilih bulan dikosongkan', $(w,'lrBulan').innerHTML === '');
    }
  });

  // ---- 14. backend masih versi lama (labaRugi belum ada di balasan) ----
  //  Halaman & API naik lewat dua workflow terpisah, jadi jeda ini nyata.
  await jalankan('Backend belum diperbarui', {
    sesiTersimpan: { token:'T12', nama:'Uji' },
    api: b => {
      if (b.action !== 'investorRingkas') return { ok:false };
      const d = buatRingkas();
      delete d.labaRugi;                 // persis seperti balasan versi lama
      return { ok:true, data: d };
    },
    periksa(w) {
      const lp = $(w,'laporanBox').innerHTML;
      cek('menyebut server belum diperbarui', lp.includes('Bagian server belum diperbarui'), lp.slice(0,220));
      cek('menyuruh muat ulang', lp.includes('Ctrl+F5'));
      cek('TIDAK bilang belum ada omset', !lp.includes('Belum ada omset'), lp.slice(0,220));
      // sisa halaman tetap jalan — KPI tidak boleh ikut mati
      cek('KPI tetap terisi', $(w,'kpis').innerHTML.includes('Rp '), $(w,'kpis').innerHTML.slice(0,150));
    }
  });

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
