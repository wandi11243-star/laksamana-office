/*
  PANDUAN: Stock, Pemakaian Bahan Baku
  ---------------------------------------------------------------------------
  Kuncinya 'usage'. Panel ini punya empat tampilan (opname, pemakaian, waste,
  serah) — disalin dari `data-tampilan` di deploy/stock/usage/.
*/
LM_HELP_ISI('usage', {
  ringkas: 'Mencatat pemakaian bahan, waste, serah terima antar shift, dan stock opname.',
  untuk: 'kitchen, bar, dan supervisor',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Pemakaian',
      isi: [
        { t:'teks', isi:'Panel ini yang menjawab pertanyaan "bahan yang keluar ke mana saja". '
              + 'Angkanya dipakai membandingkan stok fisik dengan perkiraan pemakaian dari modul '
              + 'Analytics — jadi yang tidak dicatat di sini akan muncul sebagai selisih yang '
              + 'tidak bisa dijelaskan.' },
        { t:'tabel',
          kepala:['Tampilan','Isinya'],
          baris:[
            ['Stock Opname','Hitungan fisik stok pada satu hari.'],
            ['Pemakaian','Bahan yang dipakai produksi.'],
            ['Waste','Bahan yang terbuang, rusak, atau kedaluwarsa.'],
            ['Serah Terima','Barang yang diserahkan antar shift atau antar pos.']
          ] },
        { t:'gambar', berkas:'usage/pemakaian.png',
          teks:'Tampilan Pemakaian: catatan satu per satu di bawah, ringkasannya di atas.',
          tandai:[
            'Tombol periode: 7 Hari, Bulan Ini, Semua, plus pemilih bulan.',
            'Kartu ringkasan.',
            'Daftar catatan satu per satu.'
          ] }
      ]
    },

    {
      id: 'catat', judul: 'Mencatat',
      isi: [
        { t:'langkah', judul:'Pemakaian & waste', isi:[
          'Buka tampilan yang sesuai.',
          'Pilih barangnya, isi jumlah dan satuannya.',
          'Untuk waste, tulis SEBABNYA — itu yang membedakannya dari pemakaian biasa.',
          'Simpan.'
        ]},
        { t:'langkah', judul:'Serah terima', isi:[
          'Buka *Serah Terima*.',
          'Isi barang yang diserahkan berikut jumlahnya.',
          'Sebutkan dari siapa ke siapa.',
          'Tekan *Simpan Serah Terima*.'
        ]},
        { t:'langkah', judul:'Stock opname', isi:[
          'Buka *Stock Opname*.',
          'Isi hitungan fisik tiap barang.',
          'Tekan *Simpan Opname Hari Ini*.'
        ]},
        { t:'catatan', nada:'awas', judul:'Waste yang tidak dicatat akan muncul sebagai barang hilang',
          isi:'Selisih antara stok fisik dan perkiraan pemakaian dicari orang di tempat yang '
            + 'salah kalau waste-nya tidak pernah masuk catatan. Mencatat waste bukan mengakui '
            + 'kesalahan — ia justru yang membuat angkanya bisa dijelaskan.' }
      ]
    },

    {
      id: 'periode', judul: 'Melihat Bulan Lain',
      isi: [
        { t:'teks', isi:'Ketiga report — Pemakaian, Waste, dan Serah Terima — punya pemilih '
              + 'bulannya sendiri, di samping tombol periode 7 Hari / Bulan Ini / Semua.' },
        { t:'catatan', nada:'info', judul:'Tombol periode dan pemilih bulan saling meniadakan',
          isi:'Menekan "7 Hari" sesudah memilih Februari benar-benar memberi 7 hari terakhir. '
            + 'Sebaliknya, saat sebuah bulan dipilih, TIDAK ada tombol periode yang menyala — itu '
            + 'memang benar, yang berlaku bukan salah satu dari ketiganya.' },
        { t:'catatan', nada:'awas', judul:'Tombol ✕ di sebelah pemilih bulan adalah jalan keluarnya',
          isi:'Tanpa menekannya, kamu terkurung di bulan itu sampai halaman dimuat ulang.' },
        { t:'catatan', nada:'info', judul:'Bulan lalu terambil PENUH',
          isi:'Akhir rentangnya hari terakhir bulan itu, bukan hari ini. Jadi memilih Februari di '
            + 'bulan April tetap memberi 28 atau 29 hari penuh.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Catatan bulan lalu tidak muncul',
             'Periodenya masih di Bulan Ini.',
             'Pakai pemilih bulan, bukan tombol Semua — Semua menarik seluruh data sekaligus.'],
            ['Barang yang saya cari tidak ada',
             'Belum terdaftar di master.',
             'Minta tim Purchasing menambahkannya di Database & Vendor.'],
            ['Selisih opname besar tapi tidak jelas sebabnya',
             'Waste atau serah terima belum dicatat.',
             'Periksa ketiga tampilan lain pada rentang yang sama.'],
            ['Angka di sini berbeda dengan perkiraan di Analytics',
             'Perkiraan Analytics dihitung dari resep, bukan dari catatan.',
             'Itu memang pembandingnya. Selisihnya yang jadi bahan pemeriksaan.']
          ] }
      ]
    }

  ]
});
