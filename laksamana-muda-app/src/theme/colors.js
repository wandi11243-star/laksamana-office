/*
  LAKSAMANA MUDA - Palet aplikasi customer.

  TEMA CERAH (Agustus 2026). Sebelumnya dark premium; diubah menyesuaikan modul
  reservasi office yang latarnya terang. Sumber warna: deploy/assets/tema.css
  (--paper #F7F6F4, --surface #FFFFFF, --ink #2A2620, --gold #A9791F, dst).

  Nama token SENGAJA dipertahankan sama persis dengan versi dark supaya seluruh
  layar (yang memakai colors.bg, colors.text, dst) ikut berubah tanpa disentuh.
  Yang dibalik hanya NILAI: latar jadi terang, teks jadi gelap.

  Dua hal yang TIDAK ikut dibalik, dan ini disengaja:
  1. colors.gold = #A9791F (emas reservasi, GELAP), bukan #E3A008 (emas terang).
     Emas terang di atas putih tidak terbaca (kontras < 2). Yang dipakai sebagai
     TEKS/IKON di atas latar terang harus emas gelap. Emas terang tetap hidup,
     tapi hanya sebagai LATAR gradien (gradients.gold) dengan teks onGold gelap.
  2. onGold = tetap GELAP (#1A1509). Kartu member & tombol emas dirancang
     "latar emas terang + teks gelap" (lihat memberBrand/memberPoints di
     HomeScreen). Membalik onGold jadi putih akan membuat teks itu hilang.

  Aturan copy: jangan pakai em dash atau middle dot. Pakai koma atau titik.
*/

export const colors = {
  // Emas merek. gold = emas reservasi (dipakai sbg teks/ikon di atas terang).
  gold: '#A9791F',
  goldBright: '#C8961F',
  goldDeep: '#8A6516',
  goldDim: '#7A560F',
  goldSoft: 'rgba(169,121,31,0.10)',
  goldSoftBorder: 'rgba(169,121,31,0.28)',

  // Latar terang (dari tema.css: --paper / --surface)
  bg: '#F7F6F4',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F4F2EC',
  surface3: '#ECE9E0',

  // Garis
  line: '#E7E1D3',
  lineSoft: 'rgba(60,55,45,0.10)',
  lineHard: 'rgba(60,55,45,0.18)',

  // Teks (gelap di atas latar terang)
  text: '#2A2620',
  textDim: '#4A4234',
  muted: '#5C574D',
  muted2: '#928C80',

  // Tinta di atas emas TERANG (tombol & kartu member). Tetap gelap, lihat catatan.
  onGold: '#1A1509',

  // Status. Pasangan warna + latar, versi terang aman di atas putih/krem
  // (nilai dari tema.css: --ok, --ok-bg, dst).
  ok: '#1F9D5F',
  okBg: '#E4F5EC',
  warn: '#B5831A',
  warnBg: '#F7EFDB',
  danger: '#C9432B',
  dangerBg: '#F8E4DF',
  info: '#2F7FC4',
  infoBg: '#E4EFF8',
  violet: '#7C5FC0',
  violetBg: '#ECE6F7',

  // Tier member. Digelapkan dari versi dark supaya terbaca di atas latar terang
  // (perak #C4CAD0 dulu terlalu pucat; platinum ikut emas/teal reservasi).
  tierBronze: '#B87333',
  tierSilver: '#8B9099',
  tierGold: '#A9791F',
  tierPlatinum: '#1F9D8F',

  white: '#FFFFFF',
  black: '#000000',
};

// Gradien siap pakai.
// Gradien emas (gold/goldDeep/member*) SENGAJA tetap kaya/terang: itu LATAR
// dengan teks onGold gelap (buttons) atau teks putih (goldDeep/promo). Yang
// diubah hanya 'card' (latar kartu, kini putih) dan 'dark' (tak dipakai).
export const gradients = {
  gold: ['#F5B921', '#C8961F'],
  goldDeep: ['#C8961F', '#7A560F'],
  card: ['#FFFFFF', '#F7F6F4'],
  memberBronze: ['#8A5626', '#3A2410'],
  memberSilver: ['#8B9099', '#3C4148'],
  memberGold: ['#E3A008', '#7A560F'],
  memberPlatinum: ['#5EB9AE', '#1E3B37'],
  dark: ['#FFFFFF', '#F7F6F4'],
};

export default colors;
