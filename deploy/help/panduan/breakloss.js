/*
  PANDUAN: Stock, Break & Loss
  ---------------------------------------------------------------------------
  Kuncinya 'breakloss' — SENDIRI, sama seperti tree/usage/hpp. Nama tab
  disalin dari deploy/stock/breakloss/ (Stok Barang, Catat Break / Loss,
  Riwayat, Rekap Bulanan).
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
          kepala:['Tab','Isinya'],
          baris:[
            ['Stok Barang','Daftar barang berfoto, stok terkini, dan break/loss bulan ini per barang.'],
            ['Catat Break / Loss','Formulir mencatat satu barang yang pecah atau hilang.'],
            ['Riwayat','Seluruh catatan satu bulan, termasuk yang sudah dibatalkan (dicoret).'],
            ['Rekap Bulanan','Total break & loss per barang, per tim, dan sebab tersering, berikut nilai kerugiannya.']
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
          'Buka *Stok Barang*, tekan *＋ Daftarkan Barang*.',
          'Pilih fotonya — foto membuat barang mudah dikenali saat mencatat.',
          'Isi nama, kategori, lokasi, satuan, harga satuan, dan stok minimum.',
          'Isi *Stok awal* dengan jumlah fisik sekarang (boleh dikosongkan lalu diisi lewat Opname).',
          'Tekan *Simpan*.'
        ]},
        { t:'langkah', judul:'Barang datang & hitung fisik', isi:[
          '*＋ Stok* di kartu barang: mencatat barang baru yang datang.',
          '*⚖ Opname* di kartu barang: ketik jumlah FISIK hasil hitung — selisihnya dicatat sendiri sebagai koreksi.'
        ]},
        { t:'catatan', nada:'info', judul:'Barang yang tidak dipakai lagi dinonaktifkan, bukan dihapus',
          isi:'Buka ✎ lalu *Nonaktifkan*. Riwayat break & loss-nya tetap ada dan tetap terbaca di rekap.' }
      ]
    },

    {
      id: 'catat', judul: 'Mencatat Break & Loss',
      isi: [
        { t:'langkah', judul:'Satu barang pecah atau hilang', isi:[
          'Tekan *✍️ Catat* di kartu barangnya, atau buka tab *Catat Break / Loss*.',
          'Pilih *Break* (pecah / rusak) atau *Loss* (hilang).',
          'Isi jumlah, tanggal kejadian, dan *sebab / kronologinya* — sebab wajib diisi.',
          'Tambahkan PIC, tim, dan foto bukti kalau ada.',
          'Tekan *Simpan Catatan*.'
        ]},
        { t:'catatan', nada:'awas', judul:'Salah input dibatalkan, tidak dihapus',
          isi:'Di tab *Riwayat* tekan *Batalkan* pada baris yang salah dan tulis alasannya. Barisnya '
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
