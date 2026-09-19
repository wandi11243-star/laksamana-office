/*
  PANDUAN: Stock, Pohon Resep
  ---------------------------------------------------------------------------
  Kuncinya 'tree'. Panel paling kecil di modul Stock — satu layar, dua kotak
  cari, dan sebuah pohon. Ia BACA SAJA: resepnya disunting di panel HPP.
*/
LM_HELP_ISI('tree', {
  ringkas: 'Melihat sebuah menu terurai sampai bahan mentahnya, atau sebaliknya: sebuah bahan '
         + 'dipakai menu apa saja.',
  untuk: 'kitchen lead dan purchasing',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel Pohon Resep',
      isi: [
        { t:'teks', isi:'Panel ini menjawab dua pertanyaan yang arahnya berlawanan, dan itu '
              + 'sebabnya ada DUA kotak cari:' },
        { t:'tabel',
          kepala:['Kotak','Pertanyaannya','Jawabannya'],
          baris:[
            ['Cari menu','Menu ini isinya apa saja?','Pohon yang terurai sampai bahan mentahnya.'],
            ['Cari bahan','Bahan ini dipakai menu apa saja?','Daftar menu yang memakainya, langsung maupun lewat base.']
          ] },
        { t:'catatan', nada:'info', judul:'Panel ini TIDAK bisa mengubah apa pun',
          isi:'Resep, takaran, dan harga disunting di panel *HPP & Resep*. Di sini semuanya cuma '
            + 'dibaca — jadi kalau ada yang salah, yang perlu dibuka panel sebelah.' }
      ]
    },

    {
      id: 'pakai', judul: 'Cara Memakainya',
      isi: [
        { t:'langkah', judul:'Menelusuri sebuah menu', isi:[
          'Ketik nama menunya di kotak *Cari menu*.',
          'Pilih dari hasilnya.',
          'Pohonnya terbuka: bahan langsung di tingkat pertama, base terurai di bawahnya.',
          'Klik cabangnya untuk membuka atau menutup.'
        ]},
        { t:'langkah', judul:'Menelusuri sebuah bahan', isi:[
          'Ketik nama bahannya di kotak *Cari bahan*.',
          'Hasilnya daftar menu yang memakainya.',
          'Ini yang dipakai kalau sebuah bahan naik harganya, atau habis, dan kamu perlu tahu menu apa saja yang terdampak.'
        ]},
        { t:'catatan', nada:'info', judul:'Kapan panel ini paling berguna',
          isi:'Saat harga satu bahan naik dan kamu perlu tahu menu mana yang modalnya ikut '
            + 'bergeser; atau saat satu bahan kosong dan kamu perlu tahu menu apa saja yang harus '
            + 'di-stop malam itu. Dua pertanyaan itu sulit dijawab dari Daftar Resep, karena di '
            + 'sana arahnya selalu menu ke bahan.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Menu yang saya cari tidak ada',
             'Resepnya belum dibuat di panel HPP.',
             'Buat resepnya di HPP & Resep → Daftar Resep.'],
            ['Pohonnya berhenti lebih awal',
             'Ada base yang belum punya rincian bahannya.',
             'Lengkapi resep base itu di panel HPP.'],
            ['Bahan yang saya cari tidak dipakai menu mana pun',
             'Mungkin ia Barang Floor, yang memang tidak pernah masuk resep.',
             'Periksa di HPP → Barang Floor.'],
            ['Angkanya berbeda dengan di HPP',
             'Panel ini membaca data yang sama, jadi seharusnya tidak berbeda.',
             'Muat ulang halamannya. Kalau menetap, laporkan.']
          ] }
      ]
    }

  ]
});
