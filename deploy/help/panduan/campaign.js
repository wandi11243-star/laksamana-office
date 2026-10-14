/*
  PANDUAN: Konten → Analytics (dulu modul Campaign)
  ---------------------------------------------------------------------------
  Kuncinya 'campaign'. Nama menu disalin dari TITLES di deploy/konten/analytics/:
  Insight, Kalender, Riset Tren, Bank Konten, Pengaturan (admin modul saja).
*/
LM_HELP_ISI('campaign', {
  ringkas: 'Menarik postingan TikTok brand beserta metriknya, mencatat insight, menjadwalkan konten, dan riset tren dengan AI.',
  untuk: 'tim konten, sosial media, dan marketing',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Analytics',
      isi: [
        { t:'teks', isi:'Buka modul *Konten* di Office, lalu pilih panel *Analytics*. Sidebar panel ini punya tautan ke '
            + '*Konten Planning*, dan sebaliknya.' },
        { t:'tabel',
          kepala:['Menu','Isinya'],
          baris:[
            ['Insight','Akun terhubung, konten terpopuler, insight otomatis (AI), dan daftar insight tim.'],
            ['Kalender','Kalender konten bulanan, jadwal per tanggal, dan daftar yang sudah waktunya diposting.'],
            ['Riset Tren','Riset AI: pola dari konten brand, tren, dan ide konten siap jadwal.'],
            ['Bank Konten','Content planning buatan AI, ide yang disimpan dari Riset Tren, dan ide manual — siap dijadwalkan.'],
            ['Pengaturan','Profil brand, API key AI, dan kunci TikTok. Hanya untuk admin modul.']
          ] },
        { t:'catatan', nada:'info', judul:'Posting otomatis belum aktif',
          isi:'TikTok mewajibkan audit aplikasi untuk memposting lewat API. Sampai itu selesai, kalender '
            + 'jadi pengingat: salin caption, posting dari HP, lalu tandai *Tayang* berikut tautannya.' }
      ]
    },

    {
      id: 'insight', judul: 'Mencatat Insight',
      isi: [
        { t:'langkah', judul:'Dari konten terpopuler', isi:[
          'Buka menu *Insight*. Kalau akun TikTok sudah terhubung, postingannya tertarik sendiri tiap 6 jam saat halaman dibuka.',
          'Di *Konten terpopuler*, pilih urutan *Paling banyak ditonton* atau *Engagement tertinggi*.',
          'Tekan *+ Jadikan insight* pada postingan yang ingin dipelajari — tautan, tanggal, dan metriknya terisi sendiri.',
          'Tulis *Temuan* (kenapa konten itu berhasil) dan *Rencana aksi*, lalu *Simpan insight*.'
        ]},
        { t:'langkah', judul:'Insight otomatis dari AI', isi:[
          'Di kartu *Insight otomatis (AI)*, tekan *Temukan insight*.',
          'AI membaca konten terpopuler lalu mengusulkan pola. Usulan tidak tersimpan sendiri.',
          'Tekan *Simpan sebagai insight* pada usulan yang masuk akal, periksa isinya, lalu simpan.'
        ]},
        { t:'catatan', nada:'info', judul:'Tautan & tanggal tayang wajib',
          isi:'Tiap insight harus bisa ditelusuri ke konten aslinya. Insight yang tidak dipakai lagi *diarsipkan*, tidak dihapus.' }
      ]
    },

    {
      id: 'kalender', judul: 'Menjadwalkan Konten',
      isi: [
        { t:'langkah', judul:'Jadwal baru', isi:[
          'Buka menu *Kalender*, tekan *+ Jadwalkan konten* — atau tombol *Kalender* di kartu insight, atau *Jadwalkan* di ide riset.',
          'Isi platform, judul, caption, tanggal, dan jam tayang (WIB). Status bawaannya *Terjadwal*.',
          'Saat jamnya tiba, jadwal muncul di *Sudah waktunya diposting*. Tekan *Salin caption*, posting, lalu *Sunting* → status *Tayang* + tautan postingannya.'
        ]},
        { t:'tabel',
          kepala:['Status','Artinya'],
          baris:[
            ['Draf','Masih ide, belum pasti tayang.'],
            ['Terjadwal','Sudah pasti, menunggu jam tayang.'],
            ['Tayang','Sudah diposting. Wajib menyertakan tautan postingannya.'],
            ['Batal','Tidak jadi. Tetap terlihat di kalender, dicoret.']
          ] }
      ]
    },

    {
      id: 'riset', judul: 'Riset Tren dengan AI',
      isi: [
        { t:'langkah', judul:'Menjalankan riset', isi:[
          'Buka menu *Riset Tren*, isi *Topik riset* dan platformnya.',
          'Tekan *Jalankan riset*. Prosesnya 1–2 menit; jangan tutup halaman.',
          'Baca *Pola dari konten brand*, *Tren*, dan *Ide konten*. Tekan *Jadwalkan* pada ide yang ingin dipakai, atau *Simpan ke Bank* untuk dipakai nanti.'
        ]},
        { t:'catatan', nada:'warn', judul:'Estimasi AI, bukan data pasar',
          isi:'AI tidak punya akses internet. Pola dibaca dari postingan brand sendiri; tren dan ide adalah perkiraan. Cek ulang sebelum dipakai untuk keputusan besar.' }
      ]
    },

    {
      id: 'bank', judul: 'Bank Konten & Content Planning AI',
      isi: [
        { t:'langkah', judul:'Membuat content planning', isi:[
          'Buka menu *Bank Konten*. Isi rentang tanggal, platform, jumlah konten, dan fokus (opsional).',
          'Tekan *Buat content planning*. AI memakai profil brand, insight yang masih aktif, pilar konten di Pengaturan, dan postingan brand yang paling jalan. Prosesnya 1–2 menit.',
          'Hasilnya masuk ke Bank Konten sebagai *Ide* — belum terjadwal.'
        ]},
        { t:'langkah', judul:'Memakai ide', isi:[
          'Tekan *Jadwalkan* pada ide: formulir jadwal terbuka sudah terisi judul, tanggal, jam, hook, dan caption. Simpan, dan idenya pindah ke tab *Terjadwal*.',
          'Ide yang tidak dipakai tekan *Arsipkan* — bisa dipulihkan dari tab *Arsip*. Tidak ada yang dihapus.',
          'Ide sendiri bisa ditambah lewat *+ Ide manual*.'
        ]}
      ]
    },

    {
      id: 'pengaturan', judul: 'Pengaturan (admin modul)',
      isi: [
        { t:'langkah', judul:'Menghubungkan TikTok', isi:[
          'Di TikTok for Developers, buat app lalu aktifkan *Login Kit* dengan scope *user.info.basic* dan *video.list*.',
          'Daftarkan alamat *Redirect URI* yang tertulis di halaman *Pengaturan* (dev dan produksi masing-masing punya alamat sendiri).',
          'Isi *Client key* & *Client secret* di Pengaturan, simpan, lalu tekan *Hubungkan* di menu Insight.'
        ]},
        { t:'langkah', judul:'Mengaktifkan AI', isi:[
          'Buat API key Meta Model API di dev.meta.ai.',
          'Tempel di *API key* pada kartu *AI* di Pengaturan, pilih modelnya, lalu simpan. Isinya tidak pernah ditampilkan lagi.'
        ]},
        { t:'langkah', judul:'Mengatur kategori pola insight', isi:[
          'Di Pengaturan, kartu *Kategori pola insight*: satu baris satu kategori (maksimal 20).',
          'Daftar ini dipakai formulir *Catat insight*, penyaring kategori, dan AI saat *Temukan insight*.',
          'Insight lama yang kategorinya dihapus tidak berubah — ia tetap tampil, ditandai *(lama)*.'
        ]},
        { t:'tanya', isi:[
          ['Kenapa angka Instagram & YouTube tidak tertarik sendiri?','Jalurnya belum dibuat. Angkanya tetap muncul di Konten terpopuler kalau diisi lewat *Input Performa* di modul Konten.'],
          ['Sinkron TikTok gagal, apa yang dicek?','Pesan galatnya tertulis di kartu akun TikTok. Kalau izinnya habis, tekan *Hubungkan* lagi.']
        ]}
      ]
    }

  ]
});
