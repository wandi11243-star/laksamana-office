/*
  PANDUAN: POS
  ---------------------------------------------------------------------------
  Kuncinya 'pos' — SENDIRI, bukan menumpang 'cashier'. Nama menu disalin dari
  sidebar deploy/pos/ (Order, Open Order, Riwayat, Laporan, Pengaturan).
*/
LM_HELP_ISI('pos', {
  ringkas: 'Mesin kasir: input order per meja, pembayaran, cetak struk, riwayat transaksi, dan laporan harian.',
  untuk: 'kasir dan supervisor kasir',

  bagian: [

    {
      id: 'masuk', judul: 'Masuk ke POS',
      isi: [
        { t:'teks', isi:'POS hanya bisa dibuka oleh akun Office yang dicentangkan *POS* di Kelola Akses. '
              + 'Sesudah itu kasir masuk lagi dengan *PIN kasir*-nya sendiri di layar POS — PIN inilah '
              + 'yang menentukan nama kasir di struk.' },
        { t:'tabel',
          kepala:['Peran','Yang bisa dibuka'],
          baris:[
            ['Kasir','Order, Open Order, Riwayat'],
            ['Admin','Semua, termasuk Laporan dan Pengaturan']
          ] }
      ]
    },

    {
      id: 'order', judul: 'Membuat Order & Membayar',
      isi: [
        { t:'langkah', judul:'Satu transaksi', isi:[
          'Buka menu *Order* dan pilih meja lewat denah. Ketuk kelompok (*FOOD* / *BEVERAGES*), lalu sub kategori (ubin biru), lalu menunya (ubin oranye). Nama, kategori, dan harga menu diambil dari Daftar Resep di modul HPP.',
          'Tekan *Simpan* kalau tamu belum membayar — order masuk ke *Open Order*.',
          'Tekan *Bayar*, pilih metode pembayaran, isi nominalnya, lalu *Apply*.',
          'Sesudah *Payment Submitted*, tekan *Cetak Struk* (atau struk keluar sendiri kalau cetak otomatis dinyalakan).'
        ] }
      ]
    },

    {
      id: 'printer', judul: 'Printer Struk (LAN)',
      isi: [
        { t:'langkah', judul:'Memasang printer kasir sekali saja', isi:[
          'Di Windows buka *Settings → Printers & scanners → Add device → Add manually*, pilih *Add a printer using an IP address*, lalu isi alamat IP printer kasir.',
          'Pilih kertas roll 80 mm (atau 58 mm) di setelan driver printernya.',
          'Di POS buka *Pengaturan → Printer*, pilih lebar kertas yang sama, lalu tekan *Cetak Tes*.',
          'Di dialog cetak pilih printer kasir, *Margins: None*, dan matikan *Headers and footers*.'
        ] },
        { t:'catatan', nada:'info', judul:'Struk langsung keluar tanpa dialog',
          isi:'Jadikan printer kasir printer default Windows, buka POS dari shortcut Chrome yang '
            + 'ditambah --kiosk-printing, lalu nyalakan *Cetak otomatis* di Pengaturan → Printer.' }
      ]
    },

    {
      id: 'catatan', judul: 'Yang Perlu Diketahui',
      isi: [
        { t:'catatan', nada:'info', judul:'Data tersinkron antar komputer kasir',
          isi:'Order, pengguna, menu, dan persen SC/PB1 tersimpan di server, jadi terlihat di semua '
            + 'komputer kasir. Tanda di kanan atas menyebut keadaannya: *Tersinkron*, atau *belum '
            + 'terkirim* kalau jaringan putus — data tetap aman di komputer itu dan dikirim sendiri '
            + 'begitu jaringan kembali. Setelan printer tetap milik masing-masing komputer.' },
        { t:'catatan', nada:'awas', judul:'Belum masuk ke modul lain',
          isi:'Transaksi POS belum masuk ke Finance, Cashier, atau Analytics.' }
      ]
    }
  ]
});
