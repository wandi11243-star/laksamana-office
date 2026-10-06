/*
  HELP CENTER — REGISTRI MODUL
  ---------------------------------------------------------------------------
  Daftar KUNCI IZIN yang dikenal Help Center, berikut namanya. Satu baris di
  sini = satu bab di sidebar Help, dan baris itu hanya digambar untuk orang
  yang memegang kuncinya di `lm_session.modules`.

  KUNCINYA HARUS SAMA PERSIS dengan `access:[...]` di BRANCHES pada
  deploy/index.html. Itu satu-satunya sumber kebenaran soal modul apa yang ada
  dan kunci apa yang menjaganya; daftar ini cuma menyalin nama supaya Help
  tidak perlu memuat portal. Salinan berarti ia bisa menyimpang — jadi
  `tools/uji-help.js` MEMBANDINGKAN keduanya dan merah begitu ada modul baru
  di portal yang belum disebut di sini. Jangan tambahkan kunci di sini yang
  tidak ada di portal: ia tidak akan pernah bisa dipegang siapa pun.

  LABELNYA MENGIKUTI accessLabels portal, dan itu disengaja. Kelola Akses
  menulis "Panel Kas Kecil, Performa & Rekap" pada kotak centangnya; kalau Help
  menamainya lain sama sekali, orang yang dicentangkan kunci itu tidak akan
  mengenali babnya sendiri di sini. Yang boleh berbeda cuma tanda pemisahnya:
  di sini dipakai koma, bukan titik-tengah, mengikuti aturan salin office di
  assets/tema.css. Yang diuji KUNCINYA, bukan ejaan labelnya, justru supaya
  aturan itu tidak berubah jadi larangan memperbaiki kalimat.

  `punyaPanduan` TIDAK ADA DI SINI, dan itu keputusan yang menahan bug diam.
  Ada-tidaknya panduan ditentukan oleh ADA-TIDAKNYA BERKAS panduan/<kunci>.js,
  bukan oleh tanda di daftar ini — kalau ditandai di dua tempat, bab yang
  panduannya sudah ditulis tapi lupa ditandai akan berbunyi "belum tersedia"
  tanpa satu pun galat, dan yang menulisnya tidak punya cara tahu kenapa.

  Modul yang BELUM punya panduan tetap digambar di sidebar, ditandai "sedang
  disusun". Disembunyikan, daftar yang menyusut terbaca sebagai modul yang
  hilang — dan itu kesalahan yang di repo ini sudah berkali-kali dilaporkan
  sebagai data hilang.
*/
(function (W) {
  'use strict';

  /* Nama grup disalin dari GRUP di deploy/index.html, dengan urutan yang sama.
     Urutan yang berbeda membuat orang yang pindah dari portal ke Help harus
     mencari ulang letak modulnya. */
  W.LM_HELP_GRUP = [
    { key: 'panduan',    label: 'Mulai Dari Sini' },
    { key: 'operasional', label: 'Operasional' },
    { key: 'tim',         label: 'Tim & Kru' },
    { key: 'markom',      label: 'Marketing & Event' },
    { key: 'bisnis',      label: 'Bisnis & Target' },
    { key: 'lainnya',     label: 'Lainnya' }
  ];

  /* `izin:null` berarti bab ini TIDAK dijaga kunci apa pun — ia panduan
     tentang Office itu sendiri, dan setiap orang yang bisa membuka Help
     memang perlu membacanya. Cuma bab bergrup 'panduan' yang boleh begini;
     sisanya wajib menyebut kunci, kalau tidak Help membocorkan isi modul
     kepada yang tidak berhak membukanya. */
  W.LM_HELP_MODUL = [
    { izin: null, key: 'portal', grup: 'panduan', label: 'Office & Cara Masuk',
      ringkas: 'Masuk ke Office, memilih modul, dan apa artinya kalau sebuah modul tidak muncul.' },

    { izin: 'reservasi', grup: 'operasional', label: 'Reservasi',
      ringkas: 'Booking meja, data tamu, DP, dan denah meja.' },
    { izin: 'cashier', grup: 'operasional', label: 'Cashier',
      ringkas: 'Setoran, dana masuk, report daily, dan performa kasir.' },
    { izin: 'service_excellent', grup: 'operasional', label: 'Service Excellent',
      ringkas: 'Ajakan Google Review, verifikasi bukti, pujian & keluhan tamu.' },
    { izin: 'radar', grup: 'operasional', label: 'Radar',
      ringkas: 'Papan koordinasi lintas modul: agenda, acara, dan reservasi VIP.' },
    { izin: 'ordering', grup: 'operasional', label: 'Stock, Ordering',
      ringkas: 'Input order bahan baku dan check-in penerimaan barang.' },
    { izin: 'purchasing', grup: 'operasional', label: 'Stock, Purchasing',
      ringkas: 'Antrian order, daftar vendor, dan dispatch pembelian.' },
    { izin: 'tree', grup: 'operasional', label: 'Stock, Pohon Resep',
      ringkas: 'Peta resep bertingkat dari bahan mentah sampai menu jadi.' },
    { izin: 'usage', grup: 'operasional', label: 'Stock, Pemakaian Bahan Baku',
      ringkas: 'Catatan pemakaian, waste, dan serah terima bahan.' },
    { izin: 'hpp', grup: 'operasional', label: 'Stock, HPP & Resep',
      ringkas: 'Resep dapur, harga bahan, modal per menu, dan COGS.' },

    { izin: 'jadwal', grup: 'tim', label: 'Roster, Jadwal Shift',
      ringkas: 'Menyusun jadwal shift kru, pengajuan off, dan data pegawai.' },
    { izin: 'dw', grup: 'tim', label: 'Roster, Daily Worker',
      ringkas: 'Permintaan daily worker, persetujuan HRD, dan konfirmasi kehadiran.' },
    { izin: 'absensi', grup: 'tim', label: 'Absensi',
      ringkas: 'Absen masuk dan pulang lewat HP, verifikasi lokasi dan wajah.' },
    { izin: 'akademi', grup: 'tim', label: 'Akademi',
      ringkas: 'Materi training kru dan catatan kelulusannya.' },
    { izin: 'hr', grup: 'tim', label: 'Staff Performance',
      ringkas: 'Penilaian kru, catatan kinerja, dan rekap per divisi.' },

    { izin: 'marketing', grup: 'markom', label: 'Marketing',
      ringkas: 'CRM klien, pipeline, event, reservasi VIP, dan request desain.' },
    { izin: 'event', grup: 'markom', label: 'Event',
      ringkas: 'Perencanaan acara, talent, ticketing, dan check-in hari H.' },
    { izin: 'konten', grup: 'markom', label: 'Konten',
      ringkas: 'Rencana konten, produksi, performa, dan iklan.' },

    { izin: 'kompas', grup: 'bisnis', label: 'Finance, Input Omset Harian',
      ringkas: 'Input omset harian, report daily, compliment, dan breakdown sumber.' },
    { izin: 'finance', grup: 'bisnis', label: 'Finance, Kas Kecil & Rekap',
      ringkas: 'Buku kas kecil, rekap penjualan, dashboard omset, dan performa.' },
    { izin: 'brankas', grup: 'bisnis', label: 'Finance, Brankas',
      ringkas: 'Posisi kas per bank, piutang, mutasi wallet, dan pengembalian modal.' },
    { izin: 'analytics', grup: 'bisnis', label: 'Analytics',
      ringkas: 'Analisa penjualan dari berkas POS: menu, jam, meja, promo, dan void.' },
    { izin: 'bd', grup: 'bisnis', label: 'Task Management',
      ringkas: 'Board per project, task & sub-task berurutan, promo, dan purchase order.' },
    { izin: 'investor', grup: 'bisnis', label: 'Investor Compass',
      ringkas: 'Halaman investor: omset, target, dan laporan keuangan bulanan.' },

    { izin: 'howandi_life', grup: 'lainnya', label: 'Howandi Life OS',
      ringkas: 'Pusat kendali pribadi Nahkoda.' }
  ];
})(window);
