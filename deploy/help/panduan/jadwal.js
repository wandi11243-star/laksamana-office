/*
  PANDUAN: Roster, Jadwal Shift
  ---------------------------------------------------------------------------
  Kuncinya 'jadwal'. Nama menu disalin dari TITLES di deploy/jadwal/index.html.
  Yang membuka modul ini tiga jenis orang dengan pekerjaan yang sangat berbeda —
  kru biasa, head divisi, dan HRD — jadi tiap bagian menyebut untuk siapa ia.
*/
LM_HELP_ISI('jadwal', {
  ringkas: 'Menyusun jadwal shift kru per divisi, mengajukan off dan cuti, dan melihat '
         + 'jadwal sendiri.',
  untuk: 'semua kru, head divisi, dan HRD',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Jadwal Shift',
      isi: [
        { t:'teks', isi:'Modul ini sumber resmi jadwal kru. Modul Absensi membacanya untuk '
              + 'menghitung telat dan lembur, jadi shift yang salah di sini akan muncul sebagai '
              + 'angka keterlambatan yang salah di sana.' },
        { t:'tabel',
          kepala:['Menu','Untuk siapa','Isinya'],
          baris:[
            ['Dashboard','semua','Siapa masuk dan siapa libur hari ini.'],
            ['Jadwal Bulanan','semua','Lembar sebulan penuh. Terbuka di tab Semua divisi.'],
            ['Jadwal Saya','semua','Shift kamu sendiri bulan ini.'],
            ['Pengajuan','semua','Mengajukan off, izin, cuti, atau tukar shift.'],
            ['Input Mingguan','head divisi','Tempat jadwal benar-benar disusun.'],
            ['Rekap Pegawai','head & HRD','Jadwal sebulan dan jam kerja satu orang.'],
            ['Data Pegawai','HRD','Tambah kru baru, ubah data diri, nonaktifkan yang keluar.'],
            ['Pengaturan','HRD','Definisi shift, head divisi, penempatan kru.']
          ] },
        { t:'catatan', nada:'info', judul:'Modulnya muncul sendiri tanpa dicentang',
          isi:'Kru yang kolom Tim-nya Kitchen, Bar, Floor, Cashier, HRD, atau CEO otomatis bisa '
            + 'membuka modul ini. Kalau kamu tidak melihat kartunya di Office, biasanya kolom Tim '
            + 'akunmu yang masih kosong.' }
      ]
    },

    {
      id: 'lihat', judul: 'Melihat Jadwal Sendiri',
      isi: [
        { t:'langkah', isi:[
          'Buka menu *Jadwal Saya*.',
          'Pilih bulannya kalau perlu.',
          'Shift kamu tergambar per tanggal berikut jamnya.'
        ]},
        { t:'teks', isi:'Untuk melihat seluruh tim, buka *Jadwal Bulanan*. Halaman itu selalu '
              + 'terbuka di tab *Semua* lebih dulu, supaya pertanyaan "malam Sabtu ini siapa saja '
              + 'yang masuk, di semua pos" terjawab tanpa perlu satu klik yang jawabannya sudah pasti.' },
        { t:'catatan', nada:'info', judul:'Jadwal bisa berubah sesudah kamu melihatnya',
          isi:'Head masih bisa menyunting lembar minggu berjalan. Biasakan melihat lagi sehari '
            + 'sebelum, terutama kalau ada pengajuan tukar shift yang baru disetujui.' }
      ]
    },

    {
      id: 'pengajuan', judul: 'Mengajukan Off, Izin, atau Cuti',
      isi: [
        { t:'langkah', isi:[
          'Buka menu *Pengajuan*, lalu buat pengajuan baru.',
          'Pilih *tanggalnya*. Satu pengajuan untuk satu tanggal.',
          'Pilih jenisnya: off, izin, cuti, atau tukar shift.',
          'Tulis keterangannya.',
          'Kirim, lalu tunggu. Ada DUA langkah persetujuan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Dua persetujuan, bukan satu',
          isi:'Head divisimu meloloskan dulu, baru HRD yang mengesahkan. Jadwalmu BARU berubah '
            + 'di langkah kedua — jadi status "sudah diteruskan ke HRD" belum berarti kamu boleh '
            + 'tidak masuk.' },
        { t:'tabel',
          kepala:['Status','Artinya'],
          baris:[
            ['Menunggu','Head divisimu belum memutuskan.'],
            ['Menunggu HRD','Head sudah meloloskan. Jadwal belum berubah.'],
            ['Disetujui','Sudah sah. Sel jadwalmu sudah berubah.'],
            ['Ditolak','Tidak disetujui, oleh head atau oleh HRD.']
          ] },
        { t:'catatan', nada:'info', judul:'Satu pengajuan satu tanggal',
          isi:'Untuk cuti beberapa hari, ajukan per tanggal. Itu disengaja: satu persetujuan yang '
            + 'menimpa belasan sel sekaligus berarti yang menyetujuinya tidak pernah melihat isi '
            + 'sel yang ia timpa.' },
        { t:'catatan', nada:'info', judul:'Bisa ditarik selama belum disahkan',
          isi:'Termasuk saat sudah ada di meja HRD. Kalau rencanamu berubah, tarik pengajuannya — '
            + 'jangan dibiarkan menggantung.' }
      ]
    },

    {
      id: 'susun', judul: 'Menyusun Jadwal (Head Divisi)',
      isi: [
        { t:'langkah', judul:'Cara biasa', isi:[
          'Buka *Input Mingguan*, pilih divisimu dan minggunya.',
          'Klik sel kru pada tanggal yang dimaksud, pilih shift-nya.',
          'Ulangi. Tiap sel tersimpan sendiri begitu dipilih.'
        ]},
        { t:'langkah', judul:'Kalau polanya berulang', isi:[
          'Tekan *Isi Jadwal*.',
          'Centang hari yang mau diisi. Bawaannya TIDAK ada yang tercentang.',
          'Pilih shift-nya, lalu jalankan.',
          'Sel yang akan tertimpa disebutkan satu per satu sebelum dikerjakan. Bacalah daftarnya.'
        ]},
        { t:'catatan', nada:'awas', judul:'Isi Jadwal MENIMPA sel yang sudah terisi',
          isi:'Namanya dulu "Isi Sel Kosong" dan itu menyesatkan — ia memang menimpa. Yang '
            + 'menahanmu dari menghapus kerja head lain bukan lagi namanya, melainkan daftar '
            + 'konfirmasi bentrok yang muncul sebelum ia jalan. Sel yang lahir dari pengajuan '
            + 'yang sudah disetujui ikut ditandai di sana.' },
        { t:'langkah', judul:'Kalau jadwalnya sudah disusun di Excel', isi:[
          'Tekan *Tempel dari Excel* di halaman Input Mingguan.',
          'Unggah berkasnya, atau tempel isinya langsung.',
          'Periksa pratinjaunya: tanggal, nama, dan daftar sel yang akan tertimpa.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Nama di luar roster tidak akan ditulis',
          isi:'Baris yang namanya tidak cocok dengan kru divisimu dilewati, dan disebutkan di '
            + 'pratinjau. Sistem sengaja TIDAK menebaknya ke orang termirip — jadwal yang nyasar '
            + 'ke orang yang salah jauh lebih mahal daripada satu baris yang harus diisi manual.' },
        { t:'catatan', nada:'info', judul:'Kolom tanggal dibaca dari berkasnya',
          isi:'Tanggalnya diambil dari baris tanggal di berkas itu sendiri, bukan ditebak dari '
            + 'minggu yang sedang dibuka. Lembar yang mulai hari Selasa tetap mendarat di tanggal '
            + 'yang benar.' }
      ]
    },

    {
      id: 'ekspor', judul: 'Mengekspor ke Excel',
      isi: [
        { t:'langkah', isi:[
          'Tekan tombol *Excel* di Jadwal Bulanan.',
          'Pilih siapa saja yang ikut. Bawaannya semua tercentang.',
          'Unduh.'
        ]},
        { t:'catatan', nada:'awas', judul:'Berkas sebagian ditandai di namanya',
          isi:'Kalau kamu hanya mencentang sebagian orang, nama berkasnya memuat keterangan '
            + 'berapa dari berapa. Itu penting: berkas berisi 3 dari 39 orang yang namanya sama '
            + 'persis dengan ekspor lengkap akan dikirim ke Talenta sebagai jadwal seluruh '
            + 'divisi — dan 36 orang sisanya tidak terjadwal tanpa satu pun pesan.' },
        { t:'catatan', nada:'info', judul:'Yang belum punya Employee ID ditandai',
          isi:'Barisnya tetap ikut di berkas, tapi Talenta akan melewatinya tanpa keluhan. '
            + 'Lengkapi Employee ID-nya di Data Pegawai lebih dulu.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Nama kru tidak ada di lembar mana pun',
             'Akunnya nonaktif, atau kolom Tim-nya belum diisi.',
             'Periksa di Data Pegawai. Yang nonaktif hilang dari SEMUA lembar, termasuk bulan lalu.'],
            ['Saya head tapi tidak bisa mengubah sel',
             'Kru itu bukan divisimu.',
             'Head hanya bisa menyunting barisnya sendiri, dan itu diperiksa di server.'],
            ['Pengajuan sudah disetujui tapi jadwal belum berubah',
             'Baru langkah pertama yang lewat.',
             'Periksa statusnya. "Menunggu HRD" berarti belum sah.'],
            ['Pengajuan hilang dari layar saya sesudah saya teruskan',
             'Tidak hilang. Ia pindah ke daftar yang menunggu HRD.',
             'Pita di atas daftar menyebut dua angka: yang menunggu kamu, dan yang sudah kamu teruskan.'],
            ['Divisi saya tidak punya head, pengajuan menggantung',
             'Memang tidak ada yang bisa meloloskan.',
             'HRD bisa langsung mengesahkan untuk divisi yang belum punya head.']
          ] }
      ]
    }

  ]
});
