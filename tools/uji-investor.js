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
    // omset = net; dibayarTamu = net + svc + pajak. Halaman memajang yang kedua.
    // omset = net POS; dibayarTamu = net+svc+pajak; netSales = dibayarTamu-compliment.
    // Halaman memajang netSales, sama dengan Net Sales di tab Laba Rugi.
    hariIni:  { tgl:'2026-08-27', omset: 20000000, transaksi: 120,
                svc: 1000000, pajak: 2000000, compliment: 1000000,
                dibayarTamu: 23000000, netSales: 22000000 },
    kemarin:  { tgl:'2026-08-26', omset: 16000000, dibayarTamu: 18400000, netSales: 17600000 },
    bulanIni: { kunci:'2026-08', omset: 400000000, transaksi: 2000, hariTerisi: 26,
                svc: 20000000, pajak: 40000000, compliment: 10000000,
                dibayarTamu: 460000000, netSales: 450000000, target: 500000000 },
    bulanLalu:{ kunci:'2026-07', omset: 310000000, hariTerisi: 31,
                svc: 15000000, pajak: 30000000, compliment: 5000000,
                dibayarTamu: 355000000, netSales: 350000000 },
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
      cek('nama tampil di kaki sidebar', !!w.document.querySelector('.side-user #invName'));
      cek('token ikut dikirim ke kompas-api',
          p.some(x => x.body.action === 'investorRingkas' && x.body.sesi === 'T2'));
      const kp = $(w,'kpis').innerHTML;
      cek('KPI hari ini pakai netSales Rp 22.000.000', kp.includes('Rp 22.000.000'), kp.slice(0, 200));
      cek('BUKAN net POS Rp 20.000.000', !kp.includes('>Rp 20.000.000<'), kp.slice(0, 200));
      cek('BUKAN tagihan Rp 23.000.000', !kp.includes('>Rp 23.000.000<'), kp.slice(0, 200));
      cek('delta hari ini +25.0% (22jt vs 17,6jt)', kp.includes('25.0%'));
      // rata-rata/hari atas NET SALES: 450jt/26 = 17,31jt ; bulan lalu 350jt/31 = 11,29jt -> +53.3%
      cek('delta bulan pakai rata-rata harian (53.3%)', kp.includes('53.3%'), 'harus 53.3');
      cek('KPI transaksi 2.000', kp.includes('2.000'));
      cek('rata-rata/transaksi Rp 225.000 (atas netSales)', kp.includes('Rp 225.000'));
      cek('90% dari target (450jt/500jt)', kp.includes('90% dari target'), kp.slice(0, 700));
      cek('keterangan menyebut compliment', kp.includes('dipotong compliment'), kp.slice(0, 900));
      cek('keterangan menyebut tagihan POS', kp.includes('tagihan POS Rp 460.000.000'), kp.slice(0, 1000));
      cek('catatan tanggal data terakhir', $(w,'sumberNote').innerHTML.includes('26 Agu 2026'), $(w,'sumberNote').innerHTML);
      cek('catatan menyebut Net Sales', $(w,'sumberNote').innerHTML.includes('Net Sales'), $(w,'sumberNote').innerHTML);
      cek('catatan menunjuk tab Laba Rugi', $(w,'sumberNote').innerHTML.includes('Laporan Laba Rugi'), $(w,'sumberNote').innerHTML);
      cek('bukan label server dev di domain produksi', !$(w,'sumberNote').innerHTML.includes('server dev'));
      cek('tombol tahun terbangun', $(w,'yearToggle').querySelectorAll('button').length === 2);
      cek('grafik digambar', (w.__charts || []).length === 2, String((w.__charts || []).length));
      const bar = (w.__charts || [])[1];
      cek('grafik harian 30 titik', bar && bar.data.labels.length === 30);
      cek('hari kosong jadi null, bukan 0', bar && bar.data.datasets[0].data[29] === null);
      cek('sorotan hari terbaik ada', $(w,'highlights').innerHTML.includes('Hari terbaik'));
      // tab yang belum punya sumber (programBox & bukuBox sudah dihapus)
      ['dividenBox','laporanBox'].forEach(id =>
        cek(id + ' berisi keadaan kosong', $(w,id).innerHTML.includes('kosong'), $(w,id).innerHTML.slice(0,80)));
      // eventBox & promoBox DIMUAT MALAS: kosong sampai tabnya dibuka, dan itu
      // tidak terlihat karena keduanya di dalam tab yang masih tersembunyi.
      cek('eventBox belum diisi sebelum tabnya dibuka', $(w,'eventBox').innerHTML === '', $(w,'eventBox').innerHTML.slice(0,80));
      cek('promoBox belum diisi sebelum tabnya dibuka', $(w,'promoBox').innerHTML === '');
      cek('belum memanggil investorAgenda', !p.some(x => x.body.action === 'investorAgenda'));
      cek('tidak ada angka dividen karangan', !$(w,'dividenBox').innerHTML.includes('Rp'));

      // ---- KERANGKA SIDEBAR (ala modul Reservasi) ----
      cek('sidebar ada', !!w.document.querySelector('aside.sidebar'));
      cek('menu di dalam sidebar', !!w.document.querySelector('.sidebar .side-nav#nav'));
      const menu = w.document.querySelectorAll('.side-nav button');
      cek('5 menu', menu.length === 5, String(menu.length));
      cek('urutan menu benar',
          [...menu].map(b => b.dataset.t).join(',') === 'ringkasan,laporan,dividen,event,promo',
          [...menu].map(b => b.dataset.t).join(','));
      cek('tiap menu punya ikon', [...menu].every(b => b.querySelector('.ico svg')));
      cek('menu pertama aktif', menu[0].classList.contains('active'));
      cek('ada judul kelompok', w.document.querySelectorAll('.side-nav .nav-section').length === 3,
          String(w.document.querySelectorAll('.side-nav .nav-section').length));
      // tab & tombol yang dihapus tidak boleh tersisa DI LAYAR (komentar boleh)
      const layar = w.document.body.innerText || '';
      cek('tidak ada menu Desain Buku', !layar.includes('Desain Buku'), layar.slice(0,200));
      cek('tidak ada "Akan Launching"', !layar.includes('Akan Launching'));
      cek('tidak ada #bukuBox', !$(w,'bukuBox'));
      cek('tidak ada #programBox', !$(w,'programBox'));
      // tombol keluar sama seperti modul lain: ikon kecil di kaki sidebar
      const keluar = w.document.querySelector('.sidebar .side-user .logout-x');
      cek('tombol Keluar di kaki sidebar', !!keluar);
      cek('tombol Keluar memanggil logout()', keluar && /logout\(\)/.test(keluar.getAttribute('onclick') || ''));
      cek('tidak ada topbar lama', !w.document.querySelector('.topbar'));
      // avatar berisi inisial
      cek('avatar inisial "BA"', $(w,'userAvatar').textContent === 'BA', $(w,'userAvatar').textContent);
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
      ? { ok:true, data: buatRingkas({ bulanLalu:{ kunci:'2026-07', omset: 70000000, hariTerisi: 1,
                                                   svc: 0, pajak: 0, compliment: 0,
                                                   dibayarTamu: 70000000, netSales: 70000000 } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('delta hari ini tetap digambar', kp.includes('25.0%'));
      cek('delta bulan TIDAK digambar', !kp.includes('rata-rata/hari vs'), kp.slice(0,400));
      cek('tidak menulis turun 70%', !kp.includes('70.0%'));
      cek('total bulan tetap tampil', kp.includes('Rp 450.000.000'));
    }
  });

  // ---- 9. keterangan NET vs Dibayar Tamu ----
  //  Angka aslinya 27 Agu 2026: net 546.005.454 + svc 26.180.768 + tax
  //  49.849.650 = dibayar tamu 622.035.872 (kartu Rekap Penjualan).
  await jalankan('Keterangan net vs dibayar tamu', {
    sesiTersimpan: { token:'T7', nama:'Uji' },
    api: b => b.action === 'investorRingkas'
      ? { ok:true, data: buatRingkas({
          // Angka produksi Agustus 2026, apa adanya.
          bulanIni:{ kunci:'2026-08', omset:546005454, transaksi:3996, hariTerisi:26,
                     svc:26180768, pajak:49849650, compliment:11635850,
                     dibayarTamu:622035872, netSales:610400022, target:1000000000 },
          labaRugi:[{ kunci:'2026-08', food:287816032, bev:254208573, lainnya:10453000,
                      pb1:49849650, service:26180768, totalSales:628508023,
                      diskon:6472151, compliment:11635850, totalDiskon:18108001,
                      netSales:610400022, hariTerisi:26 }],
          hariIni: { tgl:'2026-08-27', omset:null, transaksi:null, svc:null, pajak:null,
                     compliment:null, dibayarTamu:null, netSales:null } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('angka besar = Net Sales', kp.includes('Rp 610.400.022'), kp.slice(0,600));
      // Angka 622.035.872 SEKARANG SENGAJA DISEBUT di baris keterangan (jembatan
      // ke Rekap Penjualan), jadi yang diperiksa nilai KARTUNYA, bukan ada atau
      // tidaknya angka itu di mana pun.
      cek('nilai kartu BUKAN tagihan POS',
          !kp.includes('<div class="value mono">Rp 622.035.872</div>'), kp.slice(0,600));
      cek('menyebut service', kp.includes('service Rp 26 jt'), kp.slice(0,600));
      cek('menyebut pajak', kp.includes('pajak Rp 50 jt'), kp.slice(0,600));
      cek('menyebut compliment Rp 12 jt', kp.includes('dipotong compliment Rp 12 jt'), kp.slice(0,900));
      // JEMBATAN KE REKAP PENJUALAN: angka tagihan POS disebut UTUH, supaya
      // selisih Rp 11,6 jt itu tidak perlu dihitung sendiri. Ditanyakan 3x.
      cek('menyebut tagihan POS utuh', kp.includes('tagihan POS Rp 622.035.872'), kp.slice(0,1000));
      cek('61% dari target (610jt/1M)', kp.includes('61% dari target'), kp.slice(0,700));
      // INI YANG DIKELUHKAN USER: dua tab harus menyebut angka yang sama.
      const lp = $(w,'laporanBox').innerHTML;
      cek('tab Laba Rugi menyebut angka yang SAMA', lp.includes('Rp 610.400.022'), lp.slice(-600));
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
          hariIni: { tgl:'2026-08-27', omset:null, transaksi:null, svc:0, pajak:0,
                     compliment:0, dibayarTamu:null, netSales:null },
          bulanIni:{ kunci:'2026-08', omset:400000000, transaksi:2000, hariTerisi:26,
                     svc:0, pajak:0, compliment:0,
                     dibayarTamu:400000000, netSales:400000000, target:500000000 } }) }
      : { ok:false },
    periksa(w) {
      const kp = $(w,'kpis').innerHTML;
      cek('tidak ada baris net-ket', !kp.includes('net-ket'), kp.slice(0,400));
      cek('tidak menulis "omset net"', !kp.includes('omset net'));
      cek('tidak menulis "tagihan POS"', !kp.includes('tagihan POS'), kp.slice(0,400));
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

  // ---- 15. Upcoming Event & Promo: dimuat MALAS, hanya saat tabnya dibuka ----
  const AGENDA_OK = {
    ts:'2026-08-27T09:00:00+00:00', hariIni:'2026-08-27',
    event:[
      { tgl:'2026-08-27', jam:'18:00', judul:'Grand Tasting Menu', tempat:'Main Hall', jenis:'Gathering', pax:80,  sumber:'Marketing' },
      { tgl:'2026-08-28', jam:'',      judul:'Investor Gathering', tempat:'Private Room', jenis:'', pax:0,        sumber:'Event' },
      { tgl:'2026-09-12', jam:'17:00', judul:'Anniversary LM',     tempat:'Outdoor',   jenis:'Anniversary', pax:200, sumber:'Event' }
    ], eventLebih: 4,
    promo:[
      { nama:'Happy Hour Bar', kategori:'diskon',    benefit:'Diskon 30% all drinks', outlet:'Laksamana Muda', mulai:'2026-08-01', selesai:'2026-09-30', status:'running' },
      { nama:'Brunch Weekend', kategori:'free_item', benefit:'Gratis 1 dessert',      outlet:'Laksamana Muda', mulai:'2026-09-05', selesai:'2026-10-05', status:'upcoming' }
    ], promoLebih: 0,
    gagal: []
  };
  await jalankan('Agenda: event & promo', {
    sesiTersimpan: { token:'TA', nama:'Uji Agenda' },
    api: b => {
      if (b.action === 'investorRingkas') return { ok:true, data: buatRingkas() };
      if (b.action === 'investorAgenda')  return { ok:true, data: AGENDA_OK };
      return { ok:false };
    },
    async aksi(w) { w.switchTab('event'); await tunggu(80); w.switchTab('promo'); },
    periksa(w, p) {
      // MALAS: agenda tidak boleh dipanggil sebelum tabnya dibuka, dan tidak
      // boleh dipanggil dua kali walau dua tab memakainya.
      const n = p.filter(x => x.body.action === 'investorAgenda').length;
      cek('investorAgenda dipanggil tepat sekali', n === 1, String(n));
      cek('token ikut dikirim', p.some(x => x.body.action === 'investorAgenda' && x.body.sesi === 'TA'));

      const ev = $(w,'eventBox').innerHTML;
      cek('event: judul tampil', ev.includes('Grand Tasting Menu'), ev.slice(0,200));
      cek('event: bentuk tabel', ev.includes('<table class="tbl"'), ev.slice(0,300));
      cek('event: tanggal penuh di kolom', ev.includes('27 Agu 2026'), ev.slice(0,600));
      cek('event: tombol Tabel/Kalender', ev.includes(">Tabel<") && ev.includes(">Kalender<"));
      cek('event: Tabel aktif secara bawaan', /class="on"[^>]*onclick="evMode\('tabel'\)"/.test(ev), ev.slice(0,200));
      cek('event: "hari ini" untuk 27 Agu', ev.includes('hari ini'), ev.slice(0,400));
      cek('event: "besok" untuk 28 Agu', ev.includes('besok'), ev.slice(0,900));
      cek('event: tempat tampil', ev.includes('Main Hall'));
      cek('event: pax tampil di kolomnya', ev.includes('>80<'), ev.slice(0,900));
      cek('event: keterangan jumlah', ev.includes('1–3 dari 3 acara'), ev.slice(-400));
      cek('event: jam kosong jadi tanda hubung', ev.includes('kosong-sel'), ev.slice(0,900));
      cek('event: sisa dilaporkan', ev.includes('+ 4 acara lagi'), ev.slice(-200));

      const pr = $(w,'promoBox').innerHTML;
      cek('promo: nama tampil', pr.includes('Happy Hour Bar'), pr.slice(0,200));
      cek('promo: benefit tampil', pr.includes('Diskon 30% all drinks'));
      cek('promo: chip Berjalan', pr.includes('Berjalan'));
      cek('promo: chip Akan datang', pr.includes('Akan datang'));
      cek('promo: kategori diterjemahkan', pr.includes('Free Item') && pr.includes('Diskon'), pr.slice(0,600));
      cek('promo: periode tampil', pr.includes('1 Agu 2026'), pr.slice(0,600));
      cek('promo: tidak ada sisa palsu', !pr.includes('promo lagi'));
      // yang berjalan harus di ATAS yang akan datang
      cek('promo: berjalan lebih dulu',
          pr.indexOf('Happy Hour Bar') < pr.indexOf('Brunch Weekend'));
    }
  });

  // ---- 16. satu modul mati -> daftarnya tetap tampil + ada peringatan ----
  await jalankan('Agenda: satu modul tidak menjawab', {
    sesiTersimpan: { token:'TB', nama:'Uji' },
    api: b => {
      if (b.action === 'investorRingkas') return { ok:true, data: buatRingkas() };
      if (b.action === 'investorAgenda')
        return { ok:true, data: Object.assign({}, AGENDA_OK, { promo:[], promoLebih:0, gagal:['BD OS'] }) };
      return { ok:false };
    },
    async aksi(w) { w.switchTab('promo'); },
    periksa(w) {
      const pr = $(w,'promoBox').innerHTML;
      cek('ada pita peringatan', pr.includes('ag-pita'), pr.slice(0,300));
      cek('menyebut modul yang mati', pr.includes('BD OS'), pr.slice(0,300));
      // BEDANYA PENTING: kosong karena server mati != memang tidak ada promo
      cek('tidak bilang "tidak ada promo" tanpa peringatan',
          pr.indexOf('ag-pita') < pr.indexOf('Tidak ada promo'), pr.slice(0,400));
      const ev = $(w,'eventBox').innerHTML;
      cek('event tetap tampil walau BD mati', ev.includes('Grand Tasting Menu'));
    }
  });

  // ---- 17. agenda gagal total -> tab lain tidak ikut mati ----
  await jalankan('Agenda: server menolak', {
    sesiTersimpan: { token:'TC', nama:'Uji' },
    api: b => {
      if (b.action === 'investorRingkas') return { ok:true, data: buatRingkas() };
      if (b.action === 'investorAgenda')  return { ok:false, error:'tanpa_modul: Akun Anda belum diberi akses modul ini.' };
      return { ok:false };
    },
    async aksi(w) { w.switchTab('event'); },
    periksa(w) {
      cek('event menjelaskan sebabnya', $(w,'eventBox').innerHTML.includes('belum diberi akses'),
          $(w,'eventBox').innerHTML.slice(0,200));
      cek('KPI Ringkasan tetap terisi', $(w,'kpis').innerHTML.includes('Rp '), $(w,'kpis').innerHTML.slice(0,150));
      cek('tidak dilempar ke layar masuk', !terlihat(w, 'login'));
    }
  });

  // ---- 18. Event: tabel berhalaman & kalender ----
  //  25 acara supaya paginasinya benar-benar terpakai (10 per halaman).
  const BANYAK = Array.from({ length: 25 }, (_, i) => {
    const d = new Date(2026, 7, 27); d.setDate(d.getDate() + i);   // 27 Agu + i
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
              + '-' + String(d.getDate()).padStart(2, '0');
    return { tgl: iso, jam: '19:00', judul: 'Acara ke-' + (i + 1), tempat: 'Hall', jenis: '', pax: 10 };
  });
  await jalankan('Event: tabel berhalaman & kalender', {
    sesiTersimpan: { token:'TD', nama:'Uji' },
    api: b => {
      if (b.action === 'investorRingkas') return { ok:true, data: buatRingkas() };
      if (b.action === 'investorAgenda')
        return { ok:true, data:{ ts:'x', hariIni:'2026-08-27', event: BANYAK, eventLebih:0,
                                 promo:[], promoLebih:0, gagal:[] } };
      return { ok:false };
    },
    async aksi(w) { w.switchTab('event'); await tunggu(80); },
    periksa(w) {
      const $$ = () => $(w,'eventBox').innerHTML;
      // --- halaman 1 ---
      let ev = $$();
      cek('tabel: 10 baris per halaman',
          w.document.querySelectorAll('#eventBox .tbl tbody tr').length === 10,
          String(w.document.querySelectorAll('#eventBox .tbl tbody tr').length));
      cek('tabel: keterangan 1–10 dari 25', ev.includes('1–10 dari 25 acara'), ev.slice(-400));
      cek('tabel: baris pertama acara ke-1', ev.includes('Acara ke-1<'));
      cek('tabel: acara ke-11 belum tampil', !ev.includes('Acara ke-11<'));
      cek('tabel: tombol mundur mati di halaman 1',
          /onclick="evKeHal\(0\)" disabled/.test(ev), ev.slice(-500));

      // --- halaman 3 (terakhir) ---
      w.evKeHal(3); ev = $$();
      cek('tabel: halaman 3 berisi 5 baris',
          w.document.querySelectorAll('#eventBox .tbl tbody tr').length === 5);
      cek('tabel: keterangan 21–25 dari 25', ev.includes('21–25 dari 25 acara'), ev.slice(-400));
      cek('tabel: tombol maju mati di halaman terakhir',
          /onclick="evKeHal\(4\)" disabled/.test(ev), ev.slice(-500));
      cek('tabel: halaman 3 ditandai aktif', /class="on" onclick="evKeHal\(3\)"/.test(ev));

      // --- kalender ---
      w.evMode('kalender'); ev = $$();
      cek('kalender: 7 nama hari', w.document.querySelectorAll('#eventBox .cal-hd').length === 7);
      cek('kalender: mulai hari Minggu',
          w.document.querySelector('#eventBox .cal-hd').textContent === 'Min');
      cek('kalender: 42 sel', w.document.querySelectorAll('#eventBox .cal-sel').length === 42);
      cek('kalender: judul bulan Agu 2026', ev.includes('Agu 2026'), ev.slice(0,400));
      cek('kalender: hari ini ditandai', w.document.querySelectorAll('#eventBox .cal-sel.kini').length === 1);
      cek('kalender: acara tergambar di selnya', ev.includes('Acara ke-1<'), ev.slice(0,900));
      cek('kalender: menyebut jumlah acara bulan itu', /\d+ acara di Agu 2026/.test(ev), ev.slice(-300));
      cek('kalender: halaman tabel tidak ikut tergambar', !ev.includes('<table class="tbl"'));

      // --- geser bulan ---
      w.evGeserBln(1); ev = $$();
      cek('kalender: pindah ke Sep 2026', ev.includes('Sep 2026'), ev.slice(0,400));
      cek('kalender: hari ini tidak lagi ditandai',
          w.document.querySelectorAll('#eventBox .cal-sel.kini').length === 0);
      w.evGeserBln(-2); ev = $$();
      cek('kalender: bisa mundur ke bulan tanpa acara', ev.includes('Jul 2026'), ev.slice(0,400));
      cek('kalender: bulan kosong menyebutkan dirinya kosong',
          ev.includes('Tidak ada acara di Jul 2026'), ev.slice(-300));

      // --- balik ke tabel: halaman TIDAK boleh nyangkut di luar rentang ---
      w.evMode('tabel'); ev = $$();
      cek('tabel: kembali dari kalender tetap terisi',
          w.document.querySelectorAll('#eventBox .tbl tbody tr').length > 0);
    }
  });

  console.log('\n---------------------------------------');
  console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
