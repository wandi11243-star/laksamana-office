/*
  DENAH LANTAI LIVE SPACE - disalin dari modul reservasi office
  (deploy/assets/venue-layouts.js, layout "weekday"). Koordinat memakai kanvas
  tetap 1600 x 1160; penggambar di ReservationScreen mengubahnya jadi persen,
  jadi denah ikut lebar berapa pun tanpa merusak proporsi.

  Kenapa disalin, bukan diambil dari server: app ini masih prototype tanpa
  backend. Saat nanti ada API, denah ini idealnya ditarik dari endpoint yang
  sama dengan modul reservasi supaya tidak ada dua salinan koordinat yang lambat
  laun berbeda (persis alasan office memindahnya ke satu berkas bersama).

  Nomor meja, kapasitas (cap), dan zona identik dengan office. Warna zona juga
  diambil dari tema.css/reservasi (.seat.zone-*).
*/

export const SEAT_W = 1600;
export const SEAT_H = 1160;

// Meta zona: nama ramah untuk customer, warna kotak, apakah teksnya terang,
// bentuk bundar (meja bundar), dan biaya meja (dipakai hitung DP).
export const ZONE = {
  dark:    { name: 'Booth Panggung', color: '#2f3a4a', light: true,  fee: 100000 },
  vip:     { name: 'VIP',            color: '#c9b28c', light: false, fee: 150000 },
  diamond: { name: 'Diamond',        color: '#8a8078', light: true,  fee: 100000 },
  wood:    { name: 'Meja Kayu',      color: '#cdb18a', light: false, fee: 75000 },
  green:   { name: 'Meja Bundar',    color: '#43c06a', light: false, fee: 50000, round: true },
  blue:    { name: 'Reguler',        color: '#4db2e8', light: false, fee: 25000 },
  ext:     { name: 'Teras',          color: '#f7b24a', light: false, fee: 25000 },
};

// Fixture (bukan meja, tidak bisa dipilih): panggung, DJ, pintu masuk.
export const FIXTURE_STYLE = {
  stage:    { bg: '#b9b4ac', fg: '#ffffff' },
  dj:       { bg: '#C8961F', fg: '#ffffff' },
  entrance: { bg: '#ef9f3c', fg: '#5a3a00' },
};

// Helper penyusun baris/kolom, sama seperti di venue-layouts.js office.
const row = (ids, x0, y, w, h, gap, cap, zone) =>
  ids.map((id, i) => ({ id: String(id), x: x0 + i * (w + gap), y, w, h, cap, zone }));

const uBlock = [
  { id: 'U1', x: 190, y: 20,  w: 180, h: 150, cap: '7', zone: 'dark' },
  { id: 'U2', x: 190, y: 185, w: 180, h: 165, cap: '8', zone: 'dark' },
  { id: 'U3', x: 190, y: 365, w: 180, h: 160, cap: '9', zone: 'dark' },
];

const vip = [
  { id: 'VIP 4', x: 1480, y: 20,  w: 110, h: 112, cap: '6', zone: 'vip' },
  { id: 'VIP 3', x: 1480, y: 150, w: 110, h: 112, cap: '6', zone: 'vip' },
  { id: 'VIP 2', x: 1480, y: 280, w: 110, h: 112, cap: '6', zone: 'vip' },
  { id: 'VIP 1', x: 1480, y: 410, w: 110, h: 112, cap: '6', zone: 'vip' },
];

export const layout = {
  name: 'Weekday, Lantai 1',
  fixed: [
    { t: 'stage',    label: 'PANGGUNG',          x: 630, y: 10,  w: 380, h: 210 },
    { t: 'entrance', label: 'PINTU MASUK',        x: 18,  y: 470, w: 44,  h: 180 },
  ],
  tables: [
    ...uBlock,
    ...row([21, 22], 395, 25,  80, 80, 25, '4', 'green'),
    ...row([23, 24], 395, 150, 80, 80, 25, '4', 'green'),
    { id: '41', x: 1180, y: 150, w: 85, h: 85, cap: '4', zone: 'green' },
    { id: '42', x: 1345, y: 55,  w: 90, h: 90, cap: '4', zone: 'diamond' },
    { id: '43', x: 1345, y: 185, w: 90, h: 90, cap: '4', zone: 'diamond' },
    { id: '44', x: 1345, y: 315, w: 90, h: 90, cap: '4', zone: 'diamond' },
    { id: '45', x: 1345, y: 445, w: 90, h: 90, cap: '4', zone: 'diamond' },
    ...vip,
    ...row([31, 32, 33, 34, 35], 470, 360, 110, 155, 30, '7', 'wood'),
    { id: 'R1', x: 300,  y: 625, w: 200, h: 85, cap: '10-12', zone: 'wood' },
    { id: 'R2', x: 545,  y: 628, w: 80,  h: 80, cap: '4',     zone: 'green' },
    { id: 'R3', x: 675,  y: 625, w: 200, h: 85, cap: '10-12', zone: 'wood' },
    { id: 'R4', x: 920,  y: 628, w: 80,  h: 80, cap: '4',     zone: 'green' },
    { id: 'R5', x: 1050, y: 625, w: 200, h: 85, cap: '10-12', zone: 'wood' },
    { id: 'R6', x: 1295, y: 628, w: 80,  h: 80, cap: '4',     zone: 'green' },
    ...row([11, 12, 13, 14, 15, 16, 17, 18, 19], 120, 815, 130, 80, 25, '4-5', 'blue'),
    ...row([1, 2, 3, 4, 5, 6, 7, 8, 9],          120, 985, 130, 80, 25, '4-5', 'blue'),
  ],
};

// Meja yang sudah terisi. Dikosongkan (dulu contoh dummy). Di produksi diisi
// dari server: meja yang punya reservasi pada tanggal + jam terpilih.
export const takenTables = [];
