/*
  PANDUAN: Stock, Break & Loss
  ---------------------------------------------------------------------------
  Kuncinya 'breakloss' — SENDIRI, sama seperti tree/usage/hpp. Nama menu &
  sub-tab disalin dari deploy/stock/breakloss/ (bentuknya sama dengan menu
  Waste di panel Pemakaian).
*/
LM_HELP_ISI('breakloss', {
  ringkas: 'Mencatat barang inventaris yang pecah (break) atau hilang (loss), berikut stok terkininya.',
  untuk: 'steward, floor, bar, kitchen, dan supervisor',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Break & Loss',
      isi: [
        { t:'teks', isi:'Konsepnya sama dengan Waste Produk, tapi yang dicatat di sini barang yang '
              + 'dipakai berulang — piring, gelas, sendok, alat bar — bukan bahan yang habis dimakan. '
              + 'Karena itu tiap barang *didaftarkan dulu* berikut fotonya, dan stoknya selalu terlihat.' },
        { t:'tabel',
          kepala:['Menu','Sub-tab','Isinya'],
          baris:[
            ['Break & Loss','Catat Break & Loss','Formulir mencatat satu barang yang pecah atau hilang.'],
            ['Break & Loss','Report Break & Loss','Ringkasan, sebab & barang terbanyak, total per barang, dan catatan satu per satu.'],
            ['Barang & Stok','Daftarkan Barang','Mendaftarkan atau mengubah barang berikut fotonya.'],
            ['Barang & Stok','Stok Terkini','Daftar barang berfoto dengan stok terkini, + Stok, dan Opname.']
          ] },
        { t:'catatan', nada:'info', judul:'Stok tidak pernah diketik langsung',
          isi:'Stok terkini adalah jumlah seluruh catatan: barang masuk, dikurangi break dan loss, '
            + 'ditambah koreksi opname. Mengubah stok selalu lewat salah satu catatan itu, supaya '
            + 'tiap perubahan punya jejak siapa dan kapan.' }
      ]
    },

    {
      id: 'daftar', judul: 'Mendaftarkan Barang',
      isi: [
        { t:'langkah', judul:'Barang baru', isi:[
          'Buka menu *Barang & Stok* → sub-tab *Daftarkan Barang*.',
          'Pilih fotonya — foto membuat barang mudah dikenali saat mencatat.',
          'Isi nama, kategori, lokasi, satuan, harga satuan, dan stok minimum.',
          'Isi *Stok awal* dengan jumlah fisik sekarang (boleh dikosongkan lalu diisi lewat Opname).',
          'Tekan *Simpan Barang*.'
        ]},
        { t:'langkah', judul:'Barang datang & hitung fisik', isi:[
          'Tombol *+* di Stok Terkini: mencatat barang baru yang datang.',
          'Tombol *timbangan (Opname)* di Stok Terkini: ketik jumlah FISIK hasil hitung — selisihnya dicatat sendiri sebagai koreksi.'
        ]},
        { t:'catatan', nada:'info', judul:'Barang yang tidak dipakai lagi dinonaktifkan, bukan dihapus',
          isi:'Tekan tombol *pena (Ubah)* di Stok Terkini, lalu *Nonaktifkan*. Riwayat break & loss-nya tetap ada dan tetap terbaca di rekap.' }
      ]
    },

    {
      id: 'catat', judul: 'Mencatat Break & Loss',
      isi: [
        { t:'langkah', judul:'Satu barang pecah atau hilang', isi:[
          'Buka menu *Break & Loss* → *Catat Break & Loss*, atau tekan tombol *Catat* di Stok Terkini.',
          'Pilih barangnya, lalu jenisnya: *Break* (pecah / rusak) atau *Loss* (hilang).',
          'Isi jumlah, tanggal kejadian, dan *sebab / kronologinya* — sebab wajib diisi.',
          'Tambahkan PIC, tim, dan foto bukti kalau ada.',
          'Tekan *Simpan Catatan Break & Loss* — halaman pindah ke Report.'
        ]},
        { t:'catatan', nada:'awas', judul:'Salah input dibatalkan, tidak dihapus',
          isi:'Di *Report Break & Loss* tekan tombol *Batalkan* pada catatan yang salah dan tulis alasannya. Barisnya '
            + 'tetap terlihat tercoret dan berhenti dihitung, jadi stoknya kembali seperti sebelum dicatat.' }
      ]
    },

    {
      id: 'tanya', judul: 'Pertanyaan Umum',
      isi: [
        { t:'tanya', tanya:'Kenapa stok sebuah barang minus?',
          jawab:'Break atau loss yang tercatat lebih banyak daripada stok yang pernah dicatat masuk. '
              + 'Biasanya stok awalnya belum diisi. Lakukan *Opname* untuk menyamakannya dengan jumlah fisik.' },
        { t:'tanya', tanya:'Nilai kerugian memakai harga yang mana?',
          jawab:'Harga satuan barang PADA SAAT catatan dibuat. Mengubah harga barang hari ini tidak '
              + 'mengubah nilai catatan bulan lalu.' }
      ]
    }

  ]
});
