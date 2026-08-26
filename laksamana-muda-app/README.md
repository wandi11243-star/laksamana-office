# Laksamana Muda — Customer App

Aplikasi mobile customer untuk **Laksamana Muda, Coffee & Live Space**. Fokus di
loyalty program: membership, poin, order, promo, reservasi, dan event. Dibangun
dengan **React Native (Expo)**, siap dijalankan di iOS & Android.

Model app mengikuti pola Fore, Kopi Kenangan, dan Starbucks: kartu member di
depan, poin gampang dilihat, order cepat, dan semua promo dalam satu tempat.

## Fitur

**Loyalty & Poin**
- Kartu member digital dengan tier (Bronze, Silver, Gold, Platinum) dan QR
- Saldo poin, progress ke tier berikutnya, keuntungan tiap tier
- Stamp "beli 10 gratis 1"
- Katalog reward, tukar poin jadi voucher (dengan konfirmasi & saldo real-time)
- Riwayat poin (earn, redeem, bonus)

**Order & Promo**
- Menu per kategori (Signature, Kopi Susu, Non Kopi, Manual Brew, Makanan)
- Detail item: ukuran, tambahan (extra shot, oat milk), qty
- Keranjang, pakai voucher, ringkasan + pajak, poin yang didapat
- Mode Ambil Sendiri / Antar
- Promo berlangsung + redeem kode
- Connect akun: TikTok (klaim voucher live), GoFood, GrabFood, Instagram

**Reservasi (Live Space)**
- Pilih tanggal (7 hari ke depan) & jam
- Denah tempat duduk interaktif per zona (Dekat Panggung, Sofa, Meja, Bar)
- Kursi terisi/tersedia/dipilih, dibatasi sesuai jumlah orang
- Bayar DP, kode booking

**Event & Tiket**
- Event unggulan + daftar upcoming dengan progress kuota
- Detail event, harga member vs normal
- Beli tiket / RSVP gratis, e-ticket dengan QR

## Cara menjalankan

Butuh Node.js 18+ dan aplikasi **Expo Go** di HP (atau emulator).

```bash
cd laksamana-muda-app
npm install
npm start
```

Lalu scan QR yang muncul pakai Expo Go (Android) atau kamera (iOS). Atau tekan
`a` untuk Android emulator, `i` untuk iOS simulator, `w` untuk browser.

## Struktur

```
App.js                      Entry, provider + navigation
src/
  theme/
    colors.js               Palet (diadaptasi dari tema.css office ke dark premium)
    typography.js           Ukuran teks, radius, shadow
  data/mockData.js          Data contoh: menu, promo, reward, event, kursi
  context/AppContext.js     State global: poin, keranjang, voucher, reservasi, tiket
  components/               ui.js (Card, Button, Pill, dll), ScreenHeader.js
  navigation/RootNavigator  Bottom tabs + stack
  screens/                  Home, Order, Loyalty, Event, Profile + detail screens
```

## Catatan untuk produksi

Prototype ini memakai data mock dan state di memori. Untuk produksi:

1. **Backend/API** — ganti `mockData.js` dan `AppContext.js` dengan panggilan API
   (menu, poin, order, reservasi, event) + auth (nomor HP/OTP).
2. **Pembayaran** — integrasi payment gateway (Midtrans, Xendit) untuk order & DP.
3. **Poin real** — hitung poin di server saat transaksi terverifikasi, bukan di client.
4. **TikTok/GoFood** — pakai API/deep link resmi untuk connect & klaim voucher.
5. **Font brand** — pasang Plus Jakarta Sans (display) + Inter (body) via `expo-font`.
6. **Aset** — tambahkan logo kapal Laksamana Muda ke `assets/` untuk icon & splash.
7. **Notifikasi** — `expo-notifications` untuk promo, status order, reminder event.

Aturan copy mengikuti design system: tanpa em dash atau middle dot, pakai koma
atau titik.
