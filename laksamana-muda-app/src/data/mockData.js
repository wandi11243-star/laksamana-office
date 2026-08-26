/*
  Data contoh untuk prototype. Di produksi, ganti dengan panggilan API
  (menu, poin, reservasi, event). Semua harga dalam Rupiah.
*/

export const user = {
  name: 'Howandi Chandra',
  phone: '0812 3456 7890',
  memberId: 'LM-0028417',
  joinedYear: 2024,
  points: 1240,
  tier: 'Gold',
  tierProgress: 1240, // poin terkumpul di siklus tier
  nextTier: 'Platinum',
  nextTierAt: 2000,
  stampCount: 6, // gelas menuju free drink (10)
  stampGoal: 10,
  avatarInitial: 'H',
};

/*
  AKUN LOGIN (versi simple, tanpa backend). Di produksi ini pindah ke server:
  password TIDAK boleh disimpan di aplikasi, dan login diganti panggilan API
  (email + password -> token). Untuk sekarang cukup dicocokkan di memori.

  Tiap akun membawa data member (poin, tier, dst) supaya setelah login seluruh
  app (kartu member, profil, harga event member) memakai identitas yang login.
*/
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

export const tiers = [
  { name: 'Bronze', min: 0, perk: 'Poin 1x, promo dasar' },
  { name: 'Silver', min: 500, perk: 'Poin 1.25x, gratis upsize' },
  { name: 'Gold', min: 1200, perk: 'Poin 1.5x, priority reservasi' },
  { name: 'Platinum', min: 2000, perk: 'Poin 2x, free birthday drink, akses event VIP' },
];

export const promos = [
  {
    id: 'p1',
    title: 'Buy 1 Get 1 Kopi Susu',
    sub: 'Setiap Selasa, sepanjang hari',
    tag: 'BERLANGSUNG',
    tone: 'gold',
    end: 'Berakhir 30 Sep',
    desc: 'Beli satu Kopi Susu Laksamana, gratis satu untuk teman. Hanya di gerai, tidak berlaku kelipatan.',
  },
  {
    id: 'p2',
    title: 'Diskon 25% Menu Signature',
    sub: 'Member Gold & Platinum',
    tag: 'MEMBER',
    tone: 'violet',
    end: 'Berakhir 25 Sep',
    desc: 'Potongan 25% untuk semua menu signature. Otomatis saat checkout di aplikasi.',
  },
  {
    id: 'p3',
    title: 'Gratis Ongkir via GoFood',
    sub: 'Min. belanja 50rb',
    tag: 'DELIVERY',
    tone: 'info',
    end: 'Berakhir 28 Sep',
    desc: 'Pesan lewat GoFood dari akun terhubung, ongkir gratis sampai radius 5 km.',
  },
];

export const vouchers = [
  { id: 'v1', title: 'Diskon 20.000', sub: 'Min. belanja 60.000', code: 'LM20K', source: 'points', exp: '30 Sep 2026', used: false },
  { id: 'v2', title: 'Free Croffle', sub: 'Klaim dari TikTok Live', code: 'TIKTOKLM', source: 'tiktok', exp: '22 Sep 2026', used: false },
  { id: 'v3', title: 'Cashback Poin 2x', sub: 'Transaksi berikutnya', code: '2XPOIN', source: 'promo', exp: '01 Okt 2026', used: false },
];

export const connections = [
  { id: 'tiktok', name: 'TikTok', sub: 'Klaim voucher live & follow reward', connected: false, color: '#25F4EE' },
  { id: 'gofood', name: 'GoFood', sub: 'Pesan antar, poin tetap masuk', connected: true, color: '#00AA13' },
  { id: 'grabfood', name: 'GrabFood', sub: 'Pesan antar via Grab', connected: false, color: '#00B14F' },
  { id: 'instagram', name: 'Instagram', sub: 'Reward follow & tag story', connected: false, color: '#E1306C' },
];

export const menuCategories = ['Signature', 'Kopi Susu', 'Non Kopi', 'Manual Brew', 'Makanan'];

export const menu = [
  { id: 'm1', cat: 'Signature', name: 'Laksamana Muda', desc: 'Espresso, gula aren, sea salt cream', price: 32000, points: 32, emoji: '⚓', tag: 'Best Seller' },
  { id: 'm2', cat: 'Signature', name: 'Kompas Latte', desc: 'Latte pandan, palm sugar', price: 30000, points: 30, emoji: '☕', tag: 'Signature' },
  { id: 'm3', cat: 'Kopi Susu', name: 'Kopi Susu Laksamana', desc: 'House blend, susu segar, gula aren', price: 24000, points: 24, emoji: '☕', tag: '' },
  { id: 'm4', cat: 'Kopi Susu', name: 'Es Kopi Hazelnut', desc: 'Espresso, hazelnut, susu', price: 27000, points: 27, emoji: '☕', tag: '' },
  { id: 'm5', cat: 'Non Kopi', name: 'Matcha Layar', desc: 'Matcha premium, susu oat', price: 33000, points: 33, emoji: '🍵', tag: '' },
  { id: 'm6', cat: 'Non Kopi', name: 'Cokelat Rempah', desc: 'Dark chocolate, kayu manis', price: 29000, points: 29, emoji: '🍫', tag: '' },
  { id: 'm7', cat: 'Manual Brew', name: 'V60 Single Origin', desc: 'Gayo natural, rotasi biji', price: 35000, points: 35, emoji: '☕', tag: 'Barista Pick' },
  { id: 'm8', cat: 'Manual Brew', name: 'Cold Brew Nakhoda', desc: 'Diseduh 18 jam', price: 34000, points: 34, emoji: '🧊', tag: '' },
  { id: 'm9', cat: 'Makanan', name: 'Croffle Gula Aren', desc: 'Croissant waffle, saus aren', price: 28000, points: 28, emoji: '🧇', tag: '' },
  { id: 'm10', cat: 'Makanan', name: 'Nasi Goreng Pelaut', desc: 'Nasi goreng seafood, telur', price: 38000, points: 38, emoji: '🍛', tag: '' },
];

export const rewards = [
  { id: 'r1', title: 'Free Kopi Susu Laksamana', cost: 200, emoji: '☕' },
  { id: 'r2', title: 'Free Croffle Gula Aren', cost: 250, emoji: '🧇' },
  { id: 'r3', title: 'Voucher 20.000', cost: 300, emoji: '🎟️' },
  { id: 'r4', title: 'Free Signature Drink', cost: 400, emoji: '⚓' },
  { id: 'r5', title: 'Merch Tote Bag', cost: 800, emoji: '👜' },
  { id: 'r6', title: 'Tiket Live Music VIP', cost: 1200, emoji: '🎸' },
];

export const pointHistory = [
  { id: 'h1', title: 'Kopi Susu + Croffle', date: '18 Agu 2026', points: '+52', type: 'earn' },
  { id: 'h2', title: 'Tukar Voucher 20.000', date: '15 Agu 2026', points: '-300', type: 'redeem' },
  { id: 'h3', title: 'Laksamana Muda x2', date: '12 Agu 2026', points: '+64', type: 'earn' },
  { id: 'h4', title: 'Bonus Ulang Tahun', date: '05 Agu 2026', points: '+100', type: 'bonus' },
  { id: 'h5', title: 'V60 Single Origin', date: '01 Agu 2026', points: '+35', type: 'earn' },
];

export const events = [
  {
    id: 'e1',
    title: 'Live Acoustic: Senja Nusantara',
    date: '2026-08-23',
    dateLabel: 'Sab, 23 Agu 2026',
    time: '19:30 - 22:00',
    location: 'Laksamana Muda Live Space',
    price: 50000,
    memberPrice: 35000,
    seats: 45,
    left: 12,
    emoji: '🎸',
    tag: 'UPCOMING',
    desc: 'Malam akustik intim bersama musisi lokal. Termasuk 1 welcome drink. Member Gold ke atas dapat harga khusus.',
  },
  {
    id: 'e2',
    title: 'Coffee Cupping Class',
    date: '2026-08-30',
    dateLabel: 'Sab, 30 Agu 2026',
    time: '15:00 - 17:00',
    location: 'Bar Utama',
    price: 75000,
    memberPrice: 60000,
    seats: 16,
    left: 5,
    emoji: '☕',
    tag: 'WORKSHOP',
    desc: 'Belajar mencicip kopi bareng head barista. Kuota terbatas 16 orang, sudah termasuk sertifikat.',
  },
  {
    id: 'e3',
    title: 'Open Mic Malam Puisi',
    date: '2026-09-06',
    dateLabel: 'Sab, 06 Sep 2026',
    time: '20:00 - 23:00',
    location: 'Laksamana Muda Live Space',
    price: 0,
    memberPrice: 0,
    seats: 60,
    left: 33,
    emoji: '🎤',
    tag: 'GRATIS',
    desc: 'Panggung terbuka untuk puisi, stand up, dan cerita. Gratis, cukup RSVP untuk amankan tempat.',
  },
];

// Denah tempat duduk Live Space. type: table (meja), sofa, bar, stage marker.
// status di-generate: sebagian 'taken' agar terasa nyata.
export const seatZones = [
  {
    id: 'z1',
    name: 'Dekat Panggung',
    fee: 50000,
    seats: [
      { id: 'A1', taken: true }, { id: 'A2', taken: false }, { id: 'A3', taken: false }, { id: 'A4', taken: true },
      { id: 'B1', taken: false }, { id: 'B2', taken: false }, { id: 'B3', taken: true }, { id: 'B4', taken: false },
    ],
  },
  {
    id: 'z2',
    name: 'Sofa Lounge',
    fee: 75000,
    seats: [
      { id: 'S1', taken: false }, { id: 'S2', taken: true }, { id: 'S3', taken: false },
      { id: 'S4', taken: false }, { id: 'S5', taken: false }, { id: 'S6', taken: true },
    ],
  },
  {
    id: 'z3',
    name: 'Meja Reguler',
    fee: 25000,
    seats: [
      { id: 'C1', taken: false }, { id: 'C2', taken: false }, { id: 'C3', taken: false }, { id: 'C4', taken: true },
      { id: 'D1', taken: false }, { id: 'D2', taken: true }, { id: 'D3', taken: false }, { id: 'D4', taken: false },
    ],
  },
  {
    id: 'z4',
    name: 'Bar Seat',
    fee: 0,
    seats: [
      { id: 'BR1', taken: false }, { id: 'BR2', taken: false }, { id: 'BR3', taken: true }, { id: 'BR4', taken: false },
    ],
  },
];

export const timeSlots = ['11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];

export const rupiah = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
