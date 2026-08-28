/* Uji papan Reward di modul Service Excellent.

   Diuji TERISOLASI, bukan dengan merender seluruh modul: halaman itu memuat
   aset eksternal (assets/venue-layouts.js) yang tidak ada di jsdom, jadi
   boot-nya selalu gagal dan uji apa pun di sana akan gagal karena sebab yang
   tidak ada hubungannya dengan reward.

   Yang diambil dari berkas aslinya: REWARD_MIN_AWAL, REWARD_TIER_AWAL,
   normalisasiReward, rewardOf, dan rewardPapanHtml — dipotong dari sumber,
   bukan disalin, supaya uji ini ikut basi kalau fungsinya berubah. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'service_excellent', 'index.html'), 'utf8');

let lulus = 0, gagal = 0;
const cek = (nama, syarat, ket) => {
  if (syarat) { lulus++; console.log('  OK   ' + nama); }
  else { gagal++; console.log('  GAGAL ' + nama + (ket ? '  -> ' + ket : '')); }
};

/* Potong satu fungsi dari sumber, dari barisnya sampai `}` di kolom nol. */
function ambil(nama) {
  const L = SRC.split(/\r?\n/);
  const i = L.findIndex(x => x.startsWith('function ' + nama + '('));
  if (i < 0) throw new Error('fungsi tidak ditemukan di sumber: ' + nama);
  let z = i; while (z < L.length && L[z] !== '}') z++;
  if (z >= L.length) throw new Error('penutup tidak ditemukan: ' + nama);
  return L.slice(i, z + 1).join('\n');
}
function ambilConst(nama) {
  const m = SRC.match(new RegExp('^const\\s+' + nama + '\\s*=.*$', 'm'));
  if (!m) throw new Error('konstanta tidak ditemukan: ' + nama);
  return m[0];
}

/* Dependensi tiruan — hanya yang benar-benar dipakai ketiga fungsi itu. */
const PRELUDE = `
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rpDot(n){ n=Number(n)||0; return "Rp. "+n.toLocaleString("id-ID"); }
let CFG = { reward:null };
function reviewCfg(){ return CFG; }
const CAN = { master: r => r === 'master' };
let SESSION = { role:'master' };
function reviewRangeLabel(){ return 'Agustus 2026'; }
`;

const KODE = PRELUDE
  + ambilConst('REWARD_MIN_AWAL') + '\n'
  + ambilConst('REWARD_TIER_AWAL') + '\n'
  + ambil('normalisasiReward') + '\n'
  + 'function rewardCfg(){ return normalisasiReward(reviewCfg()); }\n'
  + ambil('rewardOf') + '\n'
  + ambil('rewardPapanHtml') + '\n'
  + 'module.exports = { rewardOf, rewardPapanHtml, setCfg:c=>{CFG=c;}, setRole:r=>{SESSION={role:r};} };';

const M = {};
new Function('module', KODE)(M);
const { rewardOf, rewardPapanHtml, setCfg, setRole } = M.exports;

const kru = (nama, sah) => ({ nama, sah, reward: rewardOf(sah) });

/* ================= 1. keadaan normal ================= */
console.log('\n== Papan reward, tangga bawaan (30 / 40 / 70 / 100) ==');
{
  /* Andi 120 -> tangga 100 = Rp200.000
     Budi  75 -> tangga  70 = Rp 70.000
     Cici  45 -> tangga  40 = Rp 40.000
     Dedi  33 -> lolos minimal 30, belum sampai tangga 40
     Euis  10 -> belum memenuhi syarat sama sekali            total = Rp310.000 */
  const baris = [kru('Andi', 120), kru('Budi', 75), kru('Cici', 45), kru('Dedi', 33), kru('Euis', 10)];
  const h = rewardPapanHtml(baris);

  cek('papan tergambar', h.indexOf('Reward Review') > -1);
  cek('total cair Rp. 310.000', h.indexOf('Rp. 310.000') > -1, h.slice(0, 700));
  cek('3 kru mencapai tangga', h.indexOf('3 kru mencapai tangga') > -1);
  cek('syarat minimal 30 dipajang', /Syarat Minimal<\/div>\s*<div class="val">30</.test(h));
  cek('lolos-belum-bertangga = 1 (Dedi)', /Lolos, Belum Bertangga<\/div>\s*<div class="val">1</.test(h));
  cek('belum memenuhi = 1 (Euis)', /Belum Memenuhi<\/div>\s*<div class="val">1</.test(h));

  cek('tiga tangga digambar', (h.match(/class="rw-step/g) || []).length === 3,
      String((h.match(/class="rw-step/g) || []).length));
  cek('ketiganya bertanda "ada isinya"', (h.match(/rw-step on/g) || []).length === 3);
  cek('dua panah di antaranya', (h.match(/rw-arrow/g) || []).length === 2);
  cek('tangga menyebut nominalnya', h.indexOf('Rp. 40.000') > -1 && h.indexOf('Rp. 70.000') > -1 && h.indexOf('Rp. 200.000') > -1);

  /* Tiap orang dihitung SEKALI, di tangga yang dibayarkan saja. Kalau Andi
     ikut dihitung di tangga 40 dan 70, jumlah ketiganya (5) akan lebih besar
     daripada jumlah kru yang dapat (3) — dan angka yang tidak bisa
     dijumlahkan adalah angka yang berhenti dipercaya. */
  const perTangga = [...h.matchAll(/<b>(\d+)<\/b> kru di tangga ini/g)].map(m => Number(m[1]));
  cek('tiap kru dihitung di SATU tangga saja',
      perTangga.reduce((a, b) => a + b, 0) === 3, JSON.stringify(perTangga));

  cek('daftar "sudah dapat" memuat ketiganya',
      h.indexOf('Andi') > -1 && h.indexOf('Budi') > -1 && h.indexOf('Cici') > -1);
  cek('urut dari bonus terbesar', h.indexOf('Andi') < h.indexOf('Budi'));
  cek('Dedi masuk daftar paling dekat naik', h.indexOf('Dedi') > -1);

  /* Euis belum lolos SYARAT, jadi jaraknya diukur ke syarat — bukan ke tangga.
     Syarat menang atas tangga di rewardOf(), jadi menulis "kurang 30 ke tangga
     40" untuknya adalah janji yang tidak akan ditepati. */
  cek('Euis diukur ke syarat minimal, bukan ke tangga',
      h.indexOf('syarat minimal 30 review') > -1, h.slice(-800));
  cek('menjelaskan "satu tangga tertinggi"', h.indexOf('satu tangga tertinggi') > -1);
  cek('menyebut tempat mengaturnya', h.indexOf('Kontrol') > -1);
}

/* ================= 2. bukan master: tidak diberi tahu cara mengaturnya ====== */
console.log('\n== Bukan admin ==');
{
  setRole('kru');
  const h = rewardPapanHtml([kru('Andi', 120)]);
  cek('papan tetap tampil', h.indexOf('Reward Review') > -1);
  cek('angkanya tetap terbaca', h.indexOf('Rp. 200.000') > -1);
  cek('tidak menyuruh buka Kontrol', h.indexOf('Kontrol → ⚙️ Setelan') < 0);
  setRole('master');
}

/* ================= 3. belum ada tangga sama sekali ================= */
console.log('\n== Tangga belum disetel ==');
{
  setCfg({ reward: { min: 30, tiers: [] } });
  const h = rewardPapanHtml([kru('Andi', 120)]);
  cek('menyebut belum ada tangga', h.indexOf('Belum ada tangga bonus') > -1, h.slice(0, 300));
  cek('tidak menggambar deret tangga', h.indexOf('rw-step') < 0);
  cek('tidak menulis nominal palsu', h.indexOf('Rp. 0') < 0);
  setCfg({ reward: null });
}

/* ================= 4. tidak ada yang dapat ================= */
console.log('\n== Belum ada yang mencapai tangga ==');
{
  const h = rewardPapanHtml([kru('Euis', 10), kru('Fani', 5)]);
  cek('total nol', h.indexOf('Rp. 0') > -1, h.slice(0, 700));
  cek('menyebutkan belum ada yang mencapai', h.indexOf('Belum ada kru yang mencapai') > -1);
  cek('tangga tetap digambar (aturannya tetap terbaca)', (h.match(/class="rw-step/g) || []).length === 3);
  cek('tidak ada tangga yang bertanda terisi', (h.match(/rw-step on/g) || []).length === 0);
  cek('keduanya muncul di daftar paling dekat', h.indexOf('Euis') > -1 && h.indexOf('Fani') > -1);
}

/* ================= 5. tangga tidak urut di setelan ================= */
console.log('\n== Tangga disetel tidak urut ==');
{
  /* normalisasiReward mengurutkannya; kalau tidak, tangga 40 yang ditulis
     paling belakang akan mengalahkan tangga 100 dan orang dengan 120 review
     dibayar 40.000. */
  setCfg({ reward: { min: 30, tiers: [{ rv:100, bonus:200000 }, { rv:40, bonus:40000 }, { rv:70, bonus:70000 }] } });
  const h = rewardPapanHtml([kru('Andi', 120)]);
  cek('120 review tetap dibayar tangga tertinggi', h.indexOf('Rp. 200.000') > -1, h.slice(0, 700));
  cek('tangga tergambar urut naik',
      h.indexOf('>40<') < h.indexOf('>70<') && h.indexOf('>70<') < h.indexOf('>100<'));
  setCfg({ reward: null });
}

console.log('\n---------------------------------------');
console.log('LULUS ' + lulus + '   GAGAL ' + gagal);
process.exit(gagal ? 1 : 0);
