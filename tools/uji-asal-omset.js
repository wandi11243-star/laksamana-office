/* uji-asal-omset.js — Walk In / Event / Marketing di Analytics (29 Sep 2026)
 *
 *   node tools/uji-asal-omset.js
 *
 * Permintaan user: (1) DINE IN di Metode Kunjungan dipecah jadi Walk In, Event,
 * Marketing; (2) kartu Dua Shift di Hari & Jam ikut menyebut ketiganya.
 * Event & Marketing dibaca dari Breakdown Sumber (KP.daily[].bd), shift-nya
 * dari jam mulai acara di modul Event/Marketing lewat srcId.
 *
 * Fixture dirancang supaya tiap kesalahan memberi angka BERBEDA:
 *   DINE IN 35 jt · Event 4,6 jt (4 + tax 0,4 + svc 0,2) · Marketing 3,5 jt
 *   -> Walk In 26,9 jt. Baris Agustus 9 M TIDAK boleh ikut.
 *   Shift: siang 10 jt (mkt 2 jt), malam 30 jt (event 4,6 + VIP 1),
 *   lain 1 jt, jam tak diketahui 0,5 jt (baris manual).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue; try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Setel JSDOM_PATH.'); process.exit(2);
})();
let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));

const asli = fs.readFileSync(path.join(ROOT, 'deploy/analytics/index.html'), 'utf8');
const sisip = (h, nama) => h.replace('<script src="../assets/' + nama + '"><' + '/script>',
  () => '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets', nama), 'utf8') + '<' + '/script>');
const HTML = sisip(sisip(asli, 'xlsx-baca.js'), 'performa-bonus.js');

const jam = Array.from({ length: 24 }, () => ({ grand: 0, bill: 0 }));
jam[12] = { grand: 10000000, bill: 50 }; jam[20] = { grand: 30000000, bill: 100 }; jam[2] = { grand: 1000000, bill: 5 };
const LAP = { '2026-09': { jenis: 'detail', diunggah: 1, berkas: 'x.xlsx', jam: jam,
  hari: { '2026-09-05': { grand: 41000000, bill: 155 } },
  kunjung: { 'DINE IN': { grand: 35000000, bill: 120 }, 'ONLINE': { grand: 6000000, bill: 35 } },
  kunjungBayar: {}, ringkas: { grand: 41000000, bill: 155 } } };
function kp(opt) {
  const mk = [{ eventName: 'Reuni', amount: 2000000, srcId: 'mkt:M1' },
              { eventName: 'VIP — Budi', amount: 1000000, srcId: 'vip:V1' },
              { eventName: 'Manual', amount: 500000 }];
  return { daily: [
    { date: '2026-09-05', bd: { event: [{ eventName: 'Gala', amount: 4000000, tax: 400000, service: 200000, srcId: 'evt:E1' }],
                                marketing: opt && opt.mkBesar ? mk.concat([{ eventName: 'Raksasa', amount: 40000000, srcId: 'mkt:M1' }]) : mk } },
    { date: '2026-08-30', bd: { event: [{ eventName: 'Bulan lalu', amount: 9000000000, srcId: 'evt:E1' }] } } ] };
}
function buka(opt) {
  return new JSDOM(HTML, { url: 'https://dev.laksamanamuda.id/analytics/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.alert = () => {}; w.confirm = () => true;
      w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u1', name: 'Uji',
        modules: ['analytics'], adminModules: ['analytics'] }));
      const jawab = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
      w.fetch = async (url, init) => {
        const u = String(url), body = init && init.body ? JSON.parse(init.body) : {};
        if (body.action === 'analyticsGet') return jawab({ ok: true, data: { data: { laporan: LAP, setting: {} }, akses: {}, peran: {} } });
        if (body.action) return jawab({ ok: true, data: { akses: {}, peran: {} } });
        if (u.indexOf('hpp.php') > -1) return jawab({ bahan: [], resep: [], setting: {} });
        if (u.indexOf('account-api') > -1) return jawab({ ok: true, members: [] });
        if (u.indexOf('event-api') > -1) return jawab({ ok: true, data: { events: [
          { id: 'E1', title: 'Gala', start_datetime: '2026-09-05T12:00:00.000Z', status: 'Event Done' },
          { id: 'E2', title: 'Tanpa breakdown', start_datetime: '2026-09-06T05:00:00.000Z', status: 'Event Done' },
          { id: 'E3', title: 'Belum jalan', start_datetime: '2026-09-07T05:00:00.000Z', status: 'Upcoming' }] } });
        if (u.indexOf('marketing-api') > -1) return jawab({ ok: true, data: {
          events: [{ id: 'M1', nama: 'Reuni', tanggal: '2026-09-05', status: 'Event Done', detail: { tamuDatang: '12:30', mulaiSetup: '20:00' } }],
          vip: [{ id: 'V1', nama: 'Budi', tanggal: '2026-09-05', jamMulai: '20:00' }] } });
        if (u.indexOf('action=getAll') > -1) return jawab(opt && opt.kpGagal ? { ok: false } : { ok: true, data: kp(opt) });
        return jawab({ ok: true, data: {} });
      };
    } }).window;
}
async function siap(w) {
  for (let i = 0; i < 150; i++) { try { if (w.eval('AN!==null && EV.length>0')) return; } catch (e) {} await tunggu(40); }
  throw new Error('tidak siap');
}
const layar = w => w.document.getElementById('app-view').innerHTML;
const teks = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const baris = (h, label) => { const i = h.indexOf(label); if (i < 0) return ''; return h.slice(i, h.indexOf('</tr>', i)); };

(async () => {
  console.log('\n== peta jam acara ==');
  const w = buka(); await siap(w);
  cek('event modul Event: UTC 12:00 -> 19:00 WIB', w.eval("EVJAM['evt:E1']") === '19:00', w.eval("EVJAM['evt:E1']"));
  cek('event Marketing memakai jam tamu datang, bukan mulai setup', w.eval("EVJAM['mkt:M1']") === '12:30');
  cek('Reservasi VIP memakai jamMulai', w.eval("EVJAM['vip:V1']") === '20:00');
  cek('jamPolos menolak yang bukan jam', w.jamPolos('sore') === '' && w.jamPolos('25:00') === '' && w.jamPolos('9:05') === '09:05');

  console.log('\n== asalAcaraBulan ==');
  const A = w.eval("asalAcaraBulan('2026-09')");
  cek('Event = 4,6 jt (tax+service ikut, bulan sebelah tidak)', A.evG === 4600000, A.evG);
  cek('Marketing = 3,5 jt (termasuk VIP & baris manual)', A.mkG === 3500000, A.mkG);
  cek('1 hari acara selesai tanpa breakdown (yang Upcoming tidak dihitung)', A.belum === 1, A.belum);

  console.log('\n== Metode Kunjungan: DINE IN dipecah ==');
  w.go('kunjungan'); await tunggu(40);
  let v = layar(w);
  const wi = baris(v, '&#8627; Walk In') || baris(v, '↳ Walk In');
  cek('baris Walk In ada', !!wi);
  cek('Walk In = DINE IN - acara = Rp26.900.000', /Rp26\.900\.000/.test(wi), teks(wi));
  cek('Event Rp4.600.000, 1 acara', /Rp4\.600\.000/.test(baris(v, '↳ Event')) && /1 acara/.test(baris(v, '↳ Event')), teks(baris(v, '↳ Event')));
  cek('Marketing Rp3.500.000, 3 acara', /Rp3\.500\.000/.test(baris(v, '↳ Marketing')) && /3 acara/.test(baris(v, '↳ Marketing')), teks(baris(v, '↳ Marketing')));
  cek('rincian berdiri SESUDAH baris DINE IN', v.indexOf('↳ Walk In') > v.indexOf('>DINE IN<'));
  cek('total tabel TIDAK berubah (Rp41.000.000)', /Rp41\.000\.000/.test(v.slice(v.indexOf('<tfoot>'))));
  cek('ONLINE tidak ikut dipecah', v.split('↳ Walk In').length === 2);
  cek('hari tanpa breakdown disebut', /1 hari<\/b> ada acara Event Done/.test(v));
  cek('anggapan & sumbernya dikatakan', /tidak dari POS/.test(v) && /Breakdown Sumber/.test(v));

  console.log('\n== Hari & Jam: Dua Shift ==');
  w.go('hari'); await tunggu(40);
  v = layar(w);
  const i0 = v.indexOf('Walk In, Event &amp; Marketing per Shift');
  cek('tabel per shift ada', i0 > -1);
  const tb = v.slice(i0);
  const sel = lbl => teks(baris(tb, '<b>' + lbl + '</b>'));
  cek('Walk In: siang 8 jt, malam 24,4 jt, lain 1 jt', /Rp8\.000\.000.*Rp24\.400\.000.*Rp1\.000\.000/.test(sel('Walk In')), sel('Walk In'));
  cek('Walk In di kolom jam tak diketahui: tanda hubung', /—\s*$/.test(sel('Walk In').trim()), sel('Walk In'));
  cek('Event: siang 0, malam 4,6 jt', /Rp0.*Rp4\.600\.000/.test(sel('Event')), sel('Event'));
  cek('Marketing: siang 2 jt, malam 1 jt, tak diketahui 0,5 jt', /Rp2\.000\.000.*Rp1\.000\.000.*Rp0.*Rp500\.000/.test(sel('Marketing')), sel('Marketing'));
  cek('Total = angka kartu (10 jt / 30 jt / 1 jt)', /Rp10\.000\.000.*Rp30\.000\.000.*Rp1\.000\.000/.test(teks(tb.slice(tb.indexOf('<tfoot>')))));
  cek('baris manual tanpa jam disebut, tidak ditebak', /Rp500\.000<\/b> omset acara tidak punya jam mulai/.test(tb));

  console.log('\n== acara lebih besar daripada DINE IN: dijepit & dikatakan ==');
  const w2 = buka({ mkBesar: true }); await siap(w2);
  w2.go('kunjungan'); await tunggu(40);
  v = layar(w2);
  cek('Walk In dijepit Rp0', /Rp0/.test(baris(v, '↳ Walk In')), teks(baris(v, '↳ Walk In')));
  cek('selisihnya disebut', /lebih besar<\/b> daripada DINE IN/.test(v));
  w2.go('hari'); await tunggu(40);
  cek('shift yang lewat juga dikatakan', /omset acara <b>lebih besar/.test(layar(w2)));

  console.log('\n== Breakdown Sumber tidak terbaca ==');
  const w3 = buka({ kpGagal: true }); await siap(w3);
  w3.go('kunjungan'); await tunggu(40);
  cek('rincian DINE IN mengatakan tidak bisa dipecah', layar(w3).indexOf('Walk In / Event / Marketing belum bisa dipecah') > -1);
  w3.go('hari'); await tunggu(40);
  cek('Dua Shift tetap tergambar + alasannya', /Dua Shift/.test(layar(w3)) && /belum bisa dihitung/.test(layar(w3)));

  console.log('\nLULUS ' + ok + '   GAGAL ' + gagal);
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.log('  MATI ' + (e && e.stack || e)); process.exit(1); });
