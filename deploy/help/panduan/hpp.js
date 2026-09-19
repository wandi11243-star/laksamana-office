/*
  PANDUAN: Stock, HPP & Resep
  ---------------------------------------------------------------------------
  Kuncinya 'hpp' — SENDIRI, bukan menumpang 'stock'. Isinya harga beli tiap
  bahan dan seluruh resep dapur, dua hal yang tidak otomatis boleh dilihat
  siapa pun yang berhak memesan barang. Nama menu disalin dari sidebar
  deploy/stock/hpp/.
*/
LM_HELP_ISI('hpp', {
  ringkas: 'Resep dapur, harga bahan, modal per menu, dan COGS. Angkanya dipakai memutuskan '
         + 'harga jual.',
  untuk: 'kitchen lead, bar lead, dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Panel HPP & Resep',
      isi: [
        { t:'tabel',
          kepala:['Menu','Isinya'],
          baris:[
            ['Dashboard HPP','COGS dan ringkasan modal. Halaman pertama saat panel ini dibuka.'],
            ['Daftar Resep','Seluruh resep: menu jadi dan base.'],
            ['Bahan & Harga','Master bahan berikut harga belinya.'],
            ['Barang Floor','Tisu, sedotan, cutlery, lilin meja. Dibeli dan berharga, tapi tidak pernah masuk resep.'],
            ['Pemakaian & Selisih','Perbandingan bulanan.'],
            ['Kalkulator HPP','Menimbang menu yang AKAN dijual sebelum resepnya dibuat.'],
            ['Pengaturan','Persen spare modal dan setelan lain.']
          ] },
        { t:'catatan', nada:'info', judul:'Kenapa Barang Floor dipisah',
          isi:'Kalau ia dicampur di Bahan & Harga, ia menumpuk di daftar yang justru dibaca untuk '
            + 'menjawab "modal menu ini dari mana". Yang menentukan sebuah barang Floor atau bukan '
            + 'tetap panel Purchasing lewat kolom Area; di sini cuma dibaca.' }
      ]
    },

    {
      id: 'resep', judul: 'Menyusun Resep',
      isi: [
        { t:'teks', isi:'Ada dua jenis resep, dan bedanya menentukan cara modalnya dihitung: '
              + '*Menu Jadi* adalah yang dijual ke tamu; *Base* adalah bahan olahan yang dipakai '
              + 'resep lain (saus, sirup, kaldu).' },
        { t:'langkah', isi:[
          'Buka *Daftar Resep*, pilih tab Menu Jadi atau Base.',
          'Buat resep baru: isi nama, jenis (makanan/minuman), dan *yield*-nya.',
          'Tambahkan bahannya satu per satu berikut takarannya.',
          'Bahan boleh berupa resep lain — itu yang membuat resep bertingkat.',
          'Isi harga jualnya kalau menu jadi.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'YIELD ADALAH PEMBAGI, bukan keterangan',
          isi:'Modal per satuan = modal resep ÷ yield, dan angka itulah yang dipakai resep lain '
            + 'yang memakainya sebagai bahan. Resep yang ditulis untuk SATU BATCH — misalnya '
            + 'Chicken Skin yang menghasilkan 400 Gr — harus tetap ditulis 400 Gr. Menuliskannya '
            + '"1 Porsi" tanpa ikut membagi takaran bahannya membuat modalnya melonjak ratusan '
            + 'kali lipat, TANPA satu pun galat: yang berubah cuma angka modal, dan angka modal '
            + 'yang salah terlihat persis seperti yang benar.' },
        { t:'catatan', nada:'info', judul:'Menu jadi biasa = 1 Porsi',
          isi:'Itu bawaan form-nya. Yang perlu diperhatikan hanya resep sebatch di atas.' },
        { t:'catatan', nada:'info', judul:'Baris catatan untuk tahap memasak',
          isi:'Baris tanpa nama bahan bisa dipakai memisahkan tahap ("bumbu blender saring"). Ia '
            + 'ikut di ekspor Excel ditandai sebagai Catatan, jadi satu putaran ekspor–sunting–'
            + 'impor tidak menghapusnya.' }
      ]
    },

    {
      id: 'spare', judul: 'Spare Modal',
      isi: [
        { t:'teks', isi:'Modal tiap *menu jadi* ditambah cadangan sekian persen — penutup susut, '
              + 'ceceran, dan porsi yang meleset. Persennya diatur di *Pengaturan*, bawaannya 5%.' },
        { t:'catatan', nada:'info', judul:'Dikenakan SEKALI, dan hanya di menu jadi',
          isi:'Base tidak ikut dipadding. Kalau ikut, menu yang memakai base kena 5% di atas 5%, '
            + 'dan resep bertingkat tiga kena tiga kali.' },
        { t:'catatan', nada:'awas', judul:'Nol sah, negatif diabaikan',
          isi:'Mengisi nol adalah satu-satunya cara mematikan spare tanpa menyunting kode. Negatif '
            + 'akan MENGURANGI modal — dan modal yang lebih murah daripada bahannya adalah angka '
            + 'menyesatkan yang tidak akan dipertanyakan siapa pun.' },
        { t:'catatan', nada:'info', judul:'Spare selalu ditulis sebagai barisnya sendiri',
          isi:'Di penyunting resep, di lembar PDF, dan di kartu kalkulator. Total yang 5% lebih '
            + 'besar daripada jumlah subtotal di atasnya akan dikira salah hitung.' },
        { t:'catatan', nada:'info', judul:'Kalkulator HPP ikut menghitungnya',
          isi:'Ia menimbang menu yang AKAN dijual, jadi harga yang kamu putuskan di sana harus '
            + 'sama dengan yang keluar di Daftar Resep begitu menunya benar-benar dibuat.' }
      ]
    },

    {
      id: 'kode', judul: 'Kode Menu di POS',
      isi: [
        { t:'teks', isi:'Tiap resep Menu Jadi punya kotak *Kode menu di POS*. Mengisinya membuat '
              + 'baris paket di laporan POS — yang cuma berbunyi "LARGE (PACKAGE)" — dikenali '
              + 'sebagai menu yang benar di modul Analytics, berikut bahan bakunya.' },
        { t:'langkah', isi:[
          'Buka resepnya di *Daftar Resep*.',
          'Isi *Kode menu di POS* sesuai kode di mesin kasir.',
          'Simpan. Kodenya dibakukan huruf besar sendiri.'
        ]},
        { t:'catatan', nada:'awas', judul:'Satu kode tidak boleh dipakai dua resep',
          isi:'Kalau itu terjadi, kodenya TIDAK dipasangkan ke mana pun dan dilaporkan berikut '
            + 'nama kedua resepnya. Memilih salah satunya berarti menebak resep mana yang dapat '
            + 'porsinya berikut bahan bakunya — dan kedua jawabannya sama-sama terlihat wajar.' },
        { t:'catatan', nada:'info', judul:'Resep Base tidak bisa jadi tujuan kode',
          isi:'Ia tidak dijual, jadi porsinya akan pindah ke sesuatu yang tidak pernah muncul di '
            + 'daftar menu mana pun.' },
        { t:'catatan', nada:'info', judul:'Resep berukuran punya kodenya sendiri',
          isi:'Resep "large" memegang kode large-nya, resep biasa memegang kode regular. Itu yang '
            + 'membuat takaran bahannya dihitung benar — bukan dianggap regular semua.' }
      ]
    },

    {
      id: 'excel', judul: 'Ekspor & Impor Excel',
      isi: [
        { t:'teks', isi:'Bahan & Harga, Barang Floor, dan Daftar Resep semuanya bisa diekspor ke '
              + 'Excel lalu diimpor kembali sesudah disunting.' },
        { t:'catatan', nada:'awas', judul:'Untuk resep: SATU BARIS = SATU BARIS BAHAN',
          isi:'Kolom resepnya (jenis, tipe, yield, harga jual, kode POS) ditulis di baris PERTAMA '
            + 'tiap resep saja. Diulang di tiap baris, yang menyuntingnya harus menebak baris mana '
            + 'yang menentukan.' },
        { t:'catatan', nada:'awas', judul:'Bahan resep yang IKUT di berkas diganti UTUH',
          isi:'Tidak bisa lain: menghapus baris di Excel adalah satu-satunya cara menyatakan '
            + '"bahan ini sudah tidak dipakai". Yang tetap aman: resep yang TIDAK ada di berkas '
            + 'sama sekali tidak disentuh. Aturan ini dikatakan lagi di pratinjau sebelum menulis.' },
        { t:'catatan', nada:'info', judul:'Saringan di layar TIDAK ikut ekspor',
          isi:'Berkas berisi 40 resep yang namanya sama persis dengan ekspor lengkap akan diunggah '
            + 'balik orang lain sebagai "seluruh daftar".' },
        { t:'catatan', nada:'info', judul:'Resep non-aktif tetap ikut diekspor',
          isi:'Berkas yang cuma memuat yang aktif, diunggah balik, tidak akan pernah bisa '
            + 'menghidupkan yang dimatikan.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Modal sebuah menu jauh lebih besar dari yang wajar',
             'Yield resep batch yang dipakainya ditulis 1 Porsi.',
             'Betulkan yield-nya ke hasil batch sebenarnya.'],
            ['Bahan tidak ikut terhitung di modal',
             'Namanya tidak sama persis dengan master bahan.',
             'Nama bahan di sini WAJIB sama persis dengan di basis purchasing.'],
            ['Analytics bilang "resep menunjuk dirinya sendiri"',
             'Ada bahan yang namanya sama persis dengan nama resepnya.',
             'Pitanya menyebut nama resepnya. Biasanya barang jadi yang dibeli — betulkan namanya.'],
            ['Kode POS diisi tapi Analytics tetap tidak mengenalinya',
             'Kodenya mungkin dipakai dua resep, atau ada pasangan lama yang menang.',
             'Halaman Pengaturan Analytics menyebut selisihnya berikut kedua nilainya.'],
            ['Sesudah impor Excel, kode POS seluruh resep kosong',
             'Berkas impornya tidak memuat kolom Kode POS.',
             'Ekspor ulang dari sini, sunting berkas itu, lalu impor kembali.'],
            ['Mengubah persen spare tidak menggeser angka apa pun',
             'Dulu memang begitu — sekarang tidak lagi.',
             'Kalau masih terjadi, laporkan berikut nilai yang kamu isi.']
          ] }
      ]
    }

  ]
});
