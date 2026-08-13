# Prototipe HPP — arsip rujukan

Dua berkas HTML di folder ini dikirim user pada **13 Agustus 2026** sebagai
bahan untuk modul `deploy/stock/hpp/`. Keduanya **prototipe mandiri berisi data
karangan** — bukan bagian aplikasi, tidak pernah di-deploy, dan tidak menyimpan
apa pun. Disimpan supaya keputusan "yang mana dipakai, yang mana dibuang" bisa
ditelusuri ulang tanpa menebak.

| Berkas | Isi |
|---|---|
| `Laksamana_Muda_HPP_COGS.html` | "Galangan HPP" — 7 halaman: Anjungan, Bank Bahan Baku, Bahan Olahan, Produk Jadi, Kalkulator, Pemakaian Bulanan, Pengaturan. Berbasis peran + PIN, data di localStorage. |
| `laksamana-bahan-baku_1.html` | "Kontrol Bahan Baku" — 6 peran (CEO, Finance, Head Kitchen, Head Bar, Purchasing, BD) dengan seksi Analisa Bahan, Stock Opname, Spoil & Waste, Food Cost, Penjualan, Profitabilitas, Order, Reorder, Daftar Bahan. |

## Yang DIAMBIL ke modul HPP

- **Analisa selisih bahan + lampu hijau/kuning/merah** (dari Kontrol Bahan
  Baku). Rumusnya dibawa apa adanya karena memang benar:
  `selisih = (stok awal + belanja − opname) − (resep + spoil + team + rnd + comp)`.
  Jadi menu **Pemakaian & Selisih**.
- **COGS bulanan aktual** = nilai pemakaian aktual ÷ penjualan bulan itu.
  Menjawab pertanyaan yang tidak bisa dijawab COGS teoretis dari resep.
- **Kalkulator HPP** (dari Galangan HPP) — hitung-hitungan sebelum sebuah menu
  benar-benar dibuat, tidak menyimpan apa pun.
- **Target COGS, buffer, dan ambang lampu** jadi halaman Pengaturan; sebelumnya
  ambang 33% adalah angka mati di dalam kode.

## Yang SENGAJA TIDAK diambil, dan alasannya

- **Bank Bahan Baku, Bahan Olahan, Produk Jadi, Anjungan, Food Cost** — sudah
  ada di modul sebagai Bahan & Harga, resep bertipe `base`, resep bertipe
  `dish`, dan Dashboard HPP. Membawanya berarti dua layar mengurus satu hal.
- **Stock Opname, Spoil & Waste, Order, Reorder, Daftar Bahan** — sudah punya
  rumahnya sendiri di Stock (Pemakaian Bahan Baku, Ordering, Purchasing). Dua
  tempat mencatat opname yang sama berarti dua angka yang berbeda, dan tidak
  ada cara memilih mana yang benar. Halaman Pemakaian di modul HPP untuk
  sementara meminta angkanya diketik; menyambungkannya ke modul Stock adalah
  pekerjaan berikutnya, bukan menyalinnya.
- **Dashboard per peran (CEO/Finance/Head/BD) dan login PIN** — Office sudah
  mengatur siapa melihat apa lewat kunci izin (`hpp`), dan identitasnya lewat
  SSO. Peran di dalam modul berarti daftar akses kedua yang harus diurus
  terpisah dan pasti menyimpang dari yang pertama.
