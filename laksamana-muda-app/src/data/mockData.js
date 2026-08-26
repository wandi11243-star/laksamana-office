/*
  Data aplikasi.

  KONTEN DUMMY DIKOSONGKAN (Agu 2026) atas permintaan user: menu, event, promo,
  voucher, reward, riwayat poin, koneksi, dan denah lama dikosongkan supaya app
  mulai bersih dan diisi data ASLI dari server (lewat api.php).

  Yang SENGAJA dipertahankan:
  - accounts  : akun login (app tidak bisa dibuka tanpa ini). Belum ada login
                via server, jadi tetap dicocokkan di memori.
  - tiers      : STRUKTUR tingkat member (bukan sample record), dipakai layar Poin.
  - menuCategories : label tab kategori menu (struktur), diisi item dari server.
  - timeSlots  : pilihan jam reservasi (struktur).

  Layar yang datanya kosong sudah diberi keadaan "belum ada ...", tidak crash.
  Saat menyambungkan data server, ganti array kosong di sini dengan hasil fetch
  (lihat src/data/api.js) atau pindahkan ke pemanggilan API langsung di layarnya.
*/

// ---- Akun login (dipertahankan). Di produksi: login via API + token. ----
export const accounts = [
  {
    email: 'admin@laksamana.id', password: 'admin123', role: 'Admin',
    name: 'Admin Laksamana', phone: '0811 0000 0001', memberId: 'LM-ADMIN01',
    joinedYear: 2023, points: 5200, tier: 'Platinum', nextTier: 'Platinum',
    nextTierAt: 5200, stampCount: 3, stampGoal: 10, avatarInitial: 'A',
  },
  {
    email: 'manajer@laksamana.id', password: 'manajer123', role: 'Manajer',
    name: 'Manajer Outlet', phone: '0811 0000 0002', memberId: 'LM-MGR-002',
    joinedYear: 2023, points: 3100, tier: 'Platinum', nextTier: 'Platinum',
    nextTierAt: 3100, stampCount: 5, stampGoal: 10, avatarInitial: 'M',
  },
  {
    email: 'kasir@laksamana.id', password: 'kasir123', role: 'Kasir',
    name: 'Kasir Bar', phone: '0811 0000 0003', memberId: 'LM-KSR-003',
    joinedYear: 2024, points: 640, tier: 'Silver', nextTier: 'Gold',
    nextTierAt: 1200, stampCount: 2, stampGoal: 10, avatarInitial: 'K',
  },
  {
    email: 'member@laksamana.id', password: 'member123', role: 'Member',
    name: 'Howandi Chandra', phone: '0812 3456 7890', memberId: 'LM-0028417',
    joinedYear: 2024, points: 1240, tier: 'Gold', nextTier: 'Platinum',
    nextTierAt: 2000, stampCount: 6, stampGoal: 10, avatarInitial: 'H',
  },
];

// ---- Struktur tingkat member (dipertahankan). ----
export const tiers = [
  { name: 'Bronze', min: 0, perk: 'Poin 1x, promo dasar' },
  { name: 'Silver', min: 500, perk: 'Poin 1.25x, gratis upsize' },
  { name: 'Gold', min: 1200, perk: 'Poin 1.5x, priority reservasi' },
  { name: 'Platinum', min: 2000, perk: 'Poin 2x, free birthday drink, akses event VIP' },
];

// ---- Struktur kategori menu (dipertahankan; item diisi dari server). ----
export const menuCategories = ['Signature', 'Kopi Susu', 'Non Kopi', 'Manual Brew', 'Makanan'];

// ---- Pilihan jam reservasi (dipertahankan). ----
export const timeSlots = ['11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];

// ================== KONTEN DIKOSONGKAN (isi dari server) ==================
export const promos = [];
export const vouchers = [];
export const connections = [];
export const menu = [];
export const rewards = [];
export const pointHistory = [];
export const events = [];
export const seatZones = [];

export const rupiah = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
