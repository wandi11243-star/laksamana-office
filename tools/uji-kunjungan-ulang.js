/* uji-kunjungan-ulang.js — jejak duduk lama tidak boleh menempel (26 Sep 2026)
 *
 *   node tools/uji-kunjungan-ulang.js
 *
 * Kejadian produksi 26 September 2026 ("dharma putra"): walk-in 25 Sep 22.45
 * diubah jadi reservasi 26 Sep 19:00 + status Confirmed, tapi checkinAt &
 * arrivals dari walk-in tetap menempel. Jam 04:00 tutup otomatis mengisi
 * leftAt. Malamnya ditandai Datang lagi — leftAt lama membuat isSeated()
 * palsu, jadi meja tampil KOSONG padahal tamunya duduk, dan mengubah ke
 * Confirmed tidak membersihkannya.
 *
 * TANPA jsdom: fungsinya DIPOTONG dari sumber lalu dijalankan dengan
 * tetangga tiruan. Dijalankan untuk KEDUA modul yang menulis data yang sama
 * (Reservasi & Service Excellent).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };

function potong(SRC, nama) {
  const re = new RegExp('(async\\s+)?function ' + nama + '\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fungsi tidak ketemu: ' + nama);
  let i = SRC.indexOf('{', m.index), d = 0, j = i;
  for (; j < SRC.length; j++) { const c = SRC[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
  return SRC.slice(m.index, j + 1);
}

const JAM = 3600000;
function barisKejadian(now) {
  /* bentuk persis data produksinya: status Datang (sesudah "Datang" kemarin),
     jejak duduk kemarin, leftAt dari tutup otomatis */
  return { id: 'r1', name: 'dharma putra', pax: 4, status: 'Datang', table: '31',
    checkinAt: now - 21 * JAM, leftAt: now - 16 * JAM, autoClosed: true,
    arrivals: [{ ts: now - 21 * JAM, pax: 4, by: 'Mella' }], actualPax: 4, datangDiasumsikan: 0 };
}

async function uji(berkas) {
  console.log('\n== ' + berkas + ' ==');
  const SRC = fs.readFileSync(path.join(ROOT, berkas), 'utf8');
  const kode = ['bersihkanKunjungan', 'changeStatus', 'saveArrival', 'isSeated', 'arrivedPax', 'arrivalsOf']
    .map(n => potong(SRC, n)).join('\n')
    + '\nreturn { changeStatus, saveArrival, isSeated, set:(s)=>{ STATE=s; } };';
  let jawabConfirm = true, nilaiPax = 1;
  const stub = {
    STATE: { reservations: [] }, SESSION: { name: 'Kru', role: 'admin' },
    commit: async () => true, logAudit() {}, buildNav() {}, closeModal() {}, navigate() {}, toast() {},
    openCancelModal() {}, ensureArrivals(r) { if (!Array.isArray(r.arrivals)) r.arrivals = []; },
    remainingPax: r => Math.max(0, (+r.pax || 0) - (r.arrivals || []).reduce((a, x) => a + (+x.pax || 0), 0)),
    pulihkanRes: (r, s) => { Object.keys(r).forEach(k => delete r[k]); Object.assign(r, s); },
    byId: () => ({ value: String(nilaiPax) }), confirm: () => jawabConfirm, MAX_PAX_GELOMBANG: 999, CURRENT_PAGE: '',
  };
  const nama = Object.keys(stub);
  const f = new Function(...nama, 'let STATE_=STATE;' + kode.replace(/^/, ''));
  const M = f(...nama.map(k => stub[k]));
  const now = Date.now();

  // 1. Tandai Datang (gelombang) pada baris yang tercatat pulang -> kunjungan BARU
  let r = barisKejadian(now); stub.STATE.reservations = [r];
  M.set && 0;
  nilaiPax = 4;
  await M.saveArrival('r1', true);
  cek('Datang sesudah tercatat pulang: leftAt dicabut', !r.leftAt, 'leftAt=' + r.leftAt);
  cek('...tamunya terbaca SEDANG DUDUK (meja tidak tampil kosong)', M.isSeated(r));
  cek('...gelombang lama tidak ditumpuk (4/4, bukan 8/4)', r.arrivals.length === 1 && r.actualPax === 4,
      'arrivals=' + r.arrivals.length + ' pax=' + r.actualPax);
  cek('...jam duduk = sekarang, bukan kemarin', r.checkinAt >= now);
  cek('...penanda tutup otomatis dicabut', !r.autoClosed);

  // 1b. dibatalkan di confirm "lebih banyak dari booking" -> jejak lama utuh
  r = barisKejadian(now); stub.STATE.reservations = [r];
  nilaiPax = 9; jawabConfirm = false;
  await M.saveArrival('r1', true);
  cek('batal di konfirmasi: jejak lama kembali utuh', r.leftAt === now - 16 * JAM && r.arrivals.length === 1);
  jawabConfirm = true;

  // 2. Ubah status ke Confirmed -> seluruh jejak duduk dicabut
  r = barisKejadian(now); stub.STATE.reservations = [r];
  await M.changeStatus('r1', 'Confirmed');
  cek('Confirmed: status berubah', r.status === 'Confirmed');
  cek('Confirmed: checkinAt, arrivals, leftAt dicabut',
      !r.checkinAt && !r.leftAt && r.arrivals.length === 0 && r.actualPax == null && !r.autoClosed);

  // 2b. PENGAMAN: tamu SEDANG DUDUK, status diubah tapi dijawab TIDAK -> tidak berubah apa pun
  r = barisKejadian(now); r.leftAt = 0; delete r.autoClosed; stub.STATE.reservations = [r];
  const sebelum = JSON.stringify(r);
  jawabConfirm = false;
  await M.changeStatus('r1', 'Confirmed');
  cek('pengaman: dijawab TIDAK, status & catatan kedatangan UTUH', JSON.stringify(r) === sebelum, r.status);
  await M.changeStatus('r1', 'No-show');
  cek('pengaman: tamu duduk ke No-show juga ditanya', r.status === 'Datang');
  jawabConfirm = true;
  // 2c. tanpa jejak duduk (Pending -> Confirmed) tidak ditanya
  r = { id:'r1', name:'x', pax:2, status:'Pending', arrivals:[] }; stub.STATE.reservations = [r];
  jawabConfirm = false;
  await M.changeStatus('r1', 'Confirmed');
  cek('Pending -> Confirmed tanpa jejak duduk: tidak ditanya', r.status === 'Confirmed');
  jawabConfirm = true;

  // 3. Ubah status ke Datang lewat tombol status, dari baris yang tercatat pulang
  r = barisKejadian(now); r.status = 'Confirmed'; stub.STATE.reservations = [r];
  await M.changeStatus('r1', 'Datang');
  cek('status Datang sesudah pulang: sedang duduk lagi', M.isSeated(r) && r.checkinAt >= now);

  // 4. Tutup otomatis jam 04:00 dimatikan
  cek('tutup otomatis dimatikan', /var AUTO_TUTUP_AKTIF = false;/.test(SRC)
      && /function autoCloseSeated\(\)\{\s*if\(!AUTO_TUTUP_AKTIF\) return false;/.test(SRC)
      && /if\(AUTO_TUTUP_AKTIF\) setInterval\(autoCloseSeated/.test(SRC));
}

(async () => {
  await uji('deploy/reservasi/index.html');
  await uji('deploy/service_excellent/index.html');
  console.log('\n---------------------------------------');
  console.log('LULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})();
