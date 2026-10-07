/*
  PANDUAN: Task Management (dulu BD OS — kunci izinnya tetap 'bd')
  ---------------------------------------------------------------------------
  Kuncinya 'bd'. Nama menu disalin dari NAV di deploy/bd/index.html.
*/
LM_HELP_ISI('bd', {
  ringkas: 'Ruang kerja tim: project berbentuk kartu, task berikut sub-task dan urutannya, '
         + 'timeline (Gantt), kanban per project, My Task, promo, dan purchase order.',
  untuk: 'semua tim yang memegang project',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Task Management',
      isi: [
        { t:'tabel',
          kepala:['Kelompok','Menu','Isinya'],
          baris:[
            ['Workspace','Dashboard, My Task, Projects, Timeline, Calendar','Pekerjaan sehari-hari.'],
            ['Operasi','Promotion, Purchasing','Yang menyentuh divisi lain.'],
            ['Tim','Kru','Anggota tim.']
          ] },
        { t:'catatan', nada:'info', judul:'My Task = task yang PIC-nya kamu',
          isi:'Dikelompokkan: lewat deadline, 7 hari ke depan, berikutnya, dan yang masih menunggu '
            + 'task lain. Bisa dilihat sebagai List atau Kanban.' }
      ]
    },

    {
      id: 'kerja', judul: 'Project, Task, dan Timeline',
      isi: [
        { t:'tabel',
          kepala:['Menu','Untuk apa','Bedanya'],
          baris:[
            ['Projects','Semua project sebagai kartu (atau Kanban stage).','Kartu diurut dari yang paling butuh perhatian.'],
            ['Detail project','Tab Task & sub-task, Kanban, dan Timeline.','Kanban: seret kartu antar kolom; ketik di "+ Tambah kartu" untuk task baru.'],
            ['Timeline','Gantt semua project.','Buka project untuk melihat task, sub-task, dan panah urutannya.']
          ] },
        { t:'langkah', isi:[
            'Buka *Projects*, klik kartu project-nya, lalu tab *Kanban*.',
            'Ketik nama task di kotak *+ Tambah kartu* pada kolom yang sesuai, lalu Enter.',
            'Klik kartunya untuk mengisi *Sub-task* dan bagian *Baru bisa Done kalau task ini sudah Done*.',
            'Seret kartu ke kolom berikutnya seiring pekerjaannya berjalan.',
            'Isi *Mulai* dan *Deadline* task (dan deadline sub-task) supaya batangnya tergambar di *Timeline*.'
          ] },
        { t:'catatan', nada:'awas', judul:'Task yang menunggu tidak bisa Done',
          isi:'Kartu bertanda 🔒 masih menunggu task lain. Ia tetap boleh dikerjakan, tapi tidak '
            + 'bisa ditandai Done — lewat centang, modal, maupun seret ke kolom Done — sampai task '
            + 'yang ditunggunya Done lebih dulu.' },
        { t:'catatan', nada:'info', judul:'Progress dihitung dari sub-task',
          isi:'Task yang punya sub-task menghitung progressnya sendiri dari sub-task yang sudah '
            + 'dicentang. Sub-task disimpan bersama tombol Simpan di modalnya.' }
      ]
    },

    {
      id: 'koordinasi', judul: 'Promotion',
      isi: [
        { t:'catatan', nada:'awas', judul:'Promo yang kamu daftarkan TERBACA SELURUH KRU di Radar',
          isi:'Halaman *Promotion* bukan catatan internal. Promo yang berlangsung dan akan datang '
            + 'otomatis muncul di modul Radar, yang dibuka kru operasional. Jadi tulislah nama, '
            + 'tanggal, dan ketentuannya seperti yang perlu dibaca orang di lapangan — bukan '
            + 'singkatan yang cuma dimengerti timmu.' },
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
            ['Task tidak mau pindah ke Done',
             'Ia masih menunggu task lain (tanda 🔒).',
             'Selesaikan dulu task yang disebut di kartunya, atau lepas urutannya di modal task.']
          ] }
      ]
    }

  ]
});
