/*
  PANDUAN: BD OS
  ---------------------------------------------------------------------------
  Kuncinya 'bd'. Nama menu disalin dari NAV di deploy/bd/index.html.
*/
LM_HELP_ISI('bd', {
  ringkas: 'Ruang kerja tim Business Development: task berprioritas, project berjangka, '
         + 'koordinasi ke divisi lain, promo, dan purchase order.',
  untuk: 'tim BD',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang BD OS',
      isi: [
        { t:'tabel',
          kepala:['Kelompok','Menu','Isinya'],
          baris:[
            ['Workspace','Dashboard, Tasks, Projects, Calendar','Pekerjaan sehari-hari.'],
            ['Operasi','Koordinasi, Routine, Promotion, Purchasing','Yang menyentuh divisi lain.'],
            ['Tim','Kru BD','Anggota tim.']
          ] },
        { t:'catatan', nada:'info', judul:'Tasks memakai prioritas Eisenhower',
          isi:'Penting × Mendesak. Empat kuadran, bukan satu daftar panjang — yang penting tapi '
            + 'tidak mendesak justru yang paling sering hilang dari daftar biasa.' }
      ]
    },

    {
      id: 'kerja', judul: 'Task, Project, dan Routine',
      isi: [
        { t:'tabel',
          kepala:['Menu','Untuk apa','Bedanya'],
          baris:[
            ['Tasks','Pekerjaan sekali jalan.','Selesai lalu ditutup.'],
            ['Projects','Pekerjaan besar berjangka.','Punya milestone, berlangsung berminggu-minggu.'],
            ['Routine','Pekerjaan berulang.','Yang diukur KEPATUHANNYA, bukan selesainya.']
          ] },
        { t:'catatan', nada:'info', judul:'Routine diukur berbeda',
          isi:'Yang dinilai bukan "sudah selesai atau belum" melainkan seberapa rutin ia '
            + 'dikerjakan. Memasukkan pekerjaan berulang ke Tasks membuat daftarnya penuh baris '
            + 'yang sama tiap minggu.' }
      ]
    },

    {
      id: 'koordinasi', judul: 'Koordinasi & Promotion',
      isi: [
        { t:'teks', isi:'*Koordinasi* untuk request dan follow-up ke divisi lain — hal-hal yang '
              + 'kalau cuma disampaikan lisan akan hilang jejaknya.' },
        { t:'catatan', nada:'awas', judul:'Promo yang kamu daftarkan TERBACA SELURUH KRU di Radar',
          isi:'Halaman *Promotion* bukan catatan internal. Promo yang berlangsung dan akan datang '
            + 'otomatis muncul di modul Radar, yang dibuka kru operasional. Jadi tulislah nama, '
            + 'tanggal, dan ketentuannya seperti yang perlu dibaca orang di lapangan — bukan '
            + 'singkatan yang cuma dimengerti tim BD.' },
        { t:'catatan', nada:'info', judul:'Yang sudah berakhir tidak ikut tampil di Radar',
          isi:'Hanya yang berlangsung dan akan datang. Jumlah yang tidak ditampilkan disebut di '
            + 'bawah daftarnya di sana, jadi tidak ada yang terbaca sebagai hilang.' }
      ]
    },

    {
      id: 'po', judul: 'Purchase Order',
      isi: [
        { t:'langkah', isi:[
          'Buka *Purchasing*, buat purchase request.',
          'Isi barang, jumlah, dan perkiraan harganya.',
          'Pilih *vendor*-nya dari daftar yang tersedia.',
          'Simpan, lalu perbarui statusnya saat pembeliannya berjalan.'
        ]},
        { t:'catatan', nada:'info', judul:'Daftar vendor dibaca dari modul Stock',
          isi:'Dari *Purchasing → Database & Vendor* di modul Stock, bukan daftar tersendiri di '
            + 'sini. Nama yang tersimpan tapi tidak ada di master tetap digambar, ditandai '
            + '"(lama)" — penandanya dibuang lagi saat disimpan, jadi ia tidak menular jadi '
            + 'bagian dari namanya.' },
        { t:'catatan', nada:'info', judul:'Kalau daftar vendornya belum terbaca',
          isi:'Kotaknya tetap bisa diketik, dan layarnya mengatakan daftarnya belum termuat. '
            + 'Modul Stock yang sedang tidak bisa dihubungi tidak mematikan form ini.' },
        { t:'catatan', nada:'awas', judul:'Jangan membuat master vendor kedua di sini',
          isi:'Itu pernah dicoba dan dicabut di hari yang sama. Dua daftar vendor untuk '
            + 'perusahaan yang sama pasti berbeda ejaan dalam sebulan, dan yang mentransfer tidak '
            + 'punya cara tahu mana yang lebih baru. Kalau butuh kolom baru tentang vendor, '
            + 'tambahkan di modul Stock.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Promo saya tidak muncul di Radar',
             'Tanggalnya sudah lewat, atau statusnya dijeda.',
             'Radar hanya menampilkan yang berlangsung dan akan datang.'],
            ['Kolom vendor di form PO kosong',
             'Daftar vendor dari modul Stock belum termuat.',
             'Kotaknya tetap bisa diketik. Coba muat ulang halamannya.'],
            ['Task saya hilang dari kuadran',
             'Prioritasnya berubah, atau ia sudah ditandai selesai.',
             'Periksa penyaringnya.'],
            ['Routine terlihat selalu merah',
             'Yang diukur kepatuhan, bukan penyelesaian.',
             'Itu memang bentuknya. Kalau targetnya tidak realistis, ubah jadwalnya.']
          ] }
      ]
    }

  ]
});
