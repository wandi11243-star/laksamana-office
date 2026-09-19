/*
  PANDUAN: Radar
  ---------------------------------------------------------------------------
  Kuncinya 'radar'. Nama menu disalin dari NAV di deploy/radar/index.html.
  Modul ini BACA SAJA dari ujung ke ujung — dan itu fakta pertama yang perlu
  diketahui siapa pun yang membukanya, karena tidak adanya tombol simpan di
  sini gampang dikira halaman yang belum jadi.
*/
LM_HELP_ISI('radar', {
  ringkas: 'Satu papan yang menggabungkan agenda dari Marketing, Event, Reservasi, dan promo '
         + 'dari BD OS. Hanya membaca.',
  untuk: 'seluruh kru operasional',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Radar',
      isi: [
        { t:'catatan', nada:'info', judul:'Radar HANYA MEMBACA',
          isi:'Tidak ada satu pun tombol simpan di modul ini, dan itu memang bentuknya. Semua '
            + 'yang tampil di sini dimiliki modul lain; perubahan dilakukan di modul asalnya. '
            + 'Keterangan itu juga tertulis di kaki sidebarnya.' },
        { t:'teks', isi:'Gunanya satu: menjawab *"besok ada apa saja"* tanpa harus membuka empat '
              + 'modul dan menggabungkannya dengan mata.' },
        { t:'tabel',
          kepala:['Menu','Isinya','Dari'],
          baris:[
            ['Radar','Papan ringkas: apa yang sedang dan akan berjalan.','Semua sumber.'],
            ['Kalender Terpadu','Tiga modul, satu jadwal.','Marketing, Event, Reservasi.'],
            ['Event','Daftar acara.','Marketing dan Event.'],
            ['Reservasi','Daftar booking meja.','Reservasi.'],
            ['Promo','Promo berjalan dan akan datang.','BD OS → Promotion.']
          ] },
        { t:'gambar', berkas:'radar/papan.png',
          teks:'Papan Radar: kartu ringkasan di atas, agenda di bawahnya.',
          tandai:[
            'Kartu jumlah acara dan tamu.',
            'Penyaring periode.',
            'Baris agenda, bisa diklik untuk membuka detailnya.'
          ] }
      ]
    },

    {
      id: 'baca', judul: 'Membaca Papannya',
      isi: [
        { t:'langkah', isi:[
          'Buka *Radar* untuk gambaran cepat, atau *Kalender Terpadu* untuk melihat sebulan.',
          'Klik sebuah baris untuk membuka panel detailnya.',
          'Panel itu berisi seluruh keterangan yang perlu — tidak perlu pindah ke modul asalnya.'
        ]},
        { t:'catatan', nada:'info', judul:'Kalendernya mulai hari Minggu',
          isi:'Sama dengan kalender di halaman investor. Dua kalender di satu perusahaan yang '
            + 'kolom pertamanya berbeda hari membuat orang salah baca tanggal saat berpindah layar.' },
        { t:'tabel',
          kepala:['Penanda sumber','Artinya'],
          baris:[
            ['Marketing','Acara pesanan klien, dijual tim marketing.'],
            ['Event','Acara yang diselenggarakan sendiri.'],
            ['Reservasi VIP','Booking meja VIP yang dicatat tim marketing.']
          ] },
        { t:'catatan', nada:'awas', judul:'Pax Reservasi VIP TIDAK dijumlahkan ke Total pax',
          isi:'Reservasi VIP juga mengunci meja di modul Reservasi, jadi tamunya bisa terhitung '
            + 'dua kali. Angkanya tetap ditampilkan terpisah — angka yang mungkin berganda lebih '
            + 'buruk daripada angka yang jelas-jelas dipisah, karena yang pertama tidak akan '
            + 'dipertanyakan siapa pun.' },
        { t:'catatan', nada:'info', judul:'Pax VIP adalah PERKIRAAN ATAS',
          isi:'Tamu memberi rentang saat memesan, dan yang ditampilkan batas atasnya — karena '
            + 'angka ini dibaca untuk menyiapkan tempat dan orang, dan menyiapkan kekurangan '
            + 'lebih mahal daripada menyiapkan kelebihan. Kartunya menyebut itu.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Acara yang saya tahu ada tidak muncul',
             'Statusnya masih peluang, belum pasti.',
             'Radar menampilkan yang sudah pasti. Periksa statusnya di modul asalnya.'],
            ['Panel detail sebuah baris terlihat kosong',
             'Sumbernya memang tidak menyimpan kolom itu.',
             'Tiap sumber punya kolomnya sendiri. Kalau seluruhnya kosong, laporkan.'],
            ['Promo tidak muncul',
             'Promo itu sudah berakhir atau sedang dijeda.',
             'Radar menampilkan yang berlangsung dan akan datang saja. Jumlah sisanya disebut di bawah daftarnya.'],
            ['Saya mau mengubah sesuatu tapi tidak ada tombolnya',
             'Radar memang tidak bisa mengubah apa pun.',
             'Buka modul asalnya — nama modulnya disebut di panel detailnya.'],
            ['Satu sumber tidak muncul sama sekali',
             'Modul itu mungkin sedang tidak bisa dihubungi.',
             'Radar tidak mematikan papan karenanya. Coba lagi beberapa saat kemudian.']
          ] }
      ]
    }

  ]
});
