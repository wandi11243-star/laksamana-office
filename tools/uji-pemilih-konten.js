/* Uji pemilih panel modul Konten (deploy/konten/) — 13 Oktober 2026.
 *
 * Modul Konten jadi dua panel: Konten Planning (./planning/, izin 'konten')
 * dan Analytics (./analytics/, bekas modul Campaign, izin 'campaign').
 * Yang dijaga:
 *   - pengalih di <head> pemilih: tujuan tunggal diantar langsung, dua tujuan
 *     menampilkan pemilih, tanpa izin pulang ke Office, hash lama diteruskan
 *     ke Planning (bookmark lama);
 *   - /campaign/ lama mengalihkan berikut query & hash (pita hasil TikTok);
 *   - sidebar panel Analytics memakai kerangka modul Konten, dan tautan pindah
 *     panel hanya digambar untuk yang berhak.
 *
 *   JSDOM_PATH=... node tools/uji-pemilih-konten.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');
const ROOT = path.join(__dirname, '..');
const baca = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let ok = 0, gagal = 0;
function cek(n, b, x) { if (b) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (x !== undefined ? '  -> ' + x : '')); } }
const tunggu = ms => new Promise(r => setTimeout(r, ms));

/* Skrip <head> pemilih dijalankan dengan location & localStorage TIRUAN —
   jsdom tidak menjalankan navigasi, jadi `location.replace` asli tidak bisa
   diamati. Yang diuji kode aslinya, dipotong dari berkasnya. */
const PEMILIH = baca('deploy/konten/index.html');
const SKRIP_HEAD = PEMILIH.slice(PEMILIH.indexOf('<script>') + 8, PEMILIH.indexOf('</script>'));
function jalankanPemilih(modules, hash) {
  const ls = { lm_session: modules === null ? null : JSON.stringify({ name: 'Uji', expiry: Date.now() + 3600e3, modules }) };
  const loc = { hash: hash || '', tujuan: null, replace(u) { this.tujuan = u; } };
  const win = { location: loc };
  const doc = { documentElement: { className: '' } };
  new Function('window', 'location', 'localStorage', 'document', SKRIP_HEAD)(
    win, loc, { getItem: k => ls[k] == null ? null : ls[k] }, doc);
  return { tujuan: loc.tujuan, tampil: /tampilkan-pemilih/.test(doc.documentElement.className), panel: win.__PANEL_KONTEN };
}

(async () => {
  console.log('\n== Pengalih pemilih ==');
  let r = jalankanPemilih(['konten']);
  cek('hanya konten -> langsung ke Planning', r.tujuan === './planning/', r.tujuan);
  r = jalankanPemilih(['campaign']);
  cek('hanya campaign -> langsung ke Analytics', r.tujuan === './analytics/', r.tujuan);
  r = jalankanPemilih(['konten', 'campaign']);
  cek('dua izin -> pemilih tampil, tidak dialihkan', r.tujuan === null && r.tampil, r.tujuan);
  cek('dua izin -> kedua panel ditawarkan', JSON.stringify(r.panel) === '["planning","analytics"]', JSON.stringify(r.panel));
  r = jalankanPemilih(['*']);
  cek('admin (*) -> pemilih tampil', r.tujuan === null && r.tampil);
  r = jalankanPemilih(['reservasi']);
  cek('tanpa izin -> pulang ke Office', r.tujuan === '../', r.tujuan);
  r = jalankanPemilih(null);
  cek('tanpa sesi -> pulang ke Office', r.tujuan === '../', r.tujuan);
  r = jalankanPemilih(['konten', 'campaign'], '#calendar');
  cek('hash lama diteruskan ke Planning', r.tujuan === './planning/#calendar', r.tujuan);
  r = jalankanPemilih(['campaign'], '#calendar');
  cek('hash lama TIDAK memaksa Planning bagi yang tak berhak', r.tujuan === './analytics/', r.tujuan);

  console.log('\n== Alamat lama /campaign/ ==');
  const LAMA = baca('deploy/campaign/index.html');
  cek('/campaign/ mengalihkan ke panel Analytics berikut query & hash',
    /location\.replace\('\.\.\/konten\/analytics\/' \+ location\.search \+ location\.hash\)/.test(LAMA));
  const LIB = baca('konten-mysql/lib_campaign.php');
  cek('alamat balik OAuth menunjuk panel Analytics', /'\/konten\/analytics\/'/.test(LIB));

  console.log('\n== Jalur relatif panel (dua tingkat di dalam deploy/) ==');
  for (const p of ['deploy/konten/planning/index.html', 'deploy/konten/analytics/index.html']) {
    const src = baca(p);
    const satuTingkat = (src.match(/["'(]\.\.\/(?!\.\.\/|planning\/|analytics\/)[a-z]/g) || []);
    cek(p + ': tidak ada jalur ../ yang tertinggal satu tingkat', satuTingkat.length === 0, satuTingkat.slice(0, 5).join(' '));
  }

  console.log('\n== Sidebar panel Analytics = kerangka modul Konten ==');
  const AN = baca('deploy/konten/analytics/index.html');
  async function bukaAnalytics(modules) {
    const dom = new JSDOM(AN, {
      url: 'https://dev.laksamanamuda.id/konten/analytics/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) {
        w.localStorage.setItem('lm_session', JSON.stringify({ name: 'Wandi Pranata', token: 't', expiry: Date.now() + 3600e3, modules }));
        w.fetch = () => Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, data: { insight: [], jadwal: [], riset: [], post: [], akun: [], konten: [], setting: {}, boleh: { admin: false } } })) });
      }
    });
    await tunggu(80);
    return dom.window.document;
  }
  let d = await bukaAnalytics(['konten', 'campaign']);
  cek('kepala sidebar "Laksamana Muda / Konten"', d.querySelector('.sidebar .sb-head .t1').textContent === 'Laksamana Muda' && d.querySelector('.sb-head .t2').textContent === 'Konten');
  cek('menu memakai .nav-item berikon', d.querySelectorAll('#nav .nav-item svg.ic').length >= 3);
  cek('menu aktif bertanda .active', !!d.querySelector('#nav .nav-item.active[data-v="insight"]'));
  cek('grup berjudul (.sb-group-t)', d.querySelectorAll('#nav .sb-group-t').length >= 1);
  cek('tombol ciutkan menu ada', !!d.getElementById('navMini'));
  cek('topbar ber-crumb + subjudul', !!d.querySelector('.topbar .crumb small#judulSub') && d.getElementById('judulSub').textContent.length > 0);
  cek('tautan pindah ke Konten Planning ada (berhak konten)', !!d.querySelector('#nav a.nav-item[href="../planning/"]'));
  d = await bukaAnalytics(['campaign']);
  cek('tautan Planning TIDAK digambar untuk yang cuma berhak campaign', !d.querySelector('#nav a[href="../planning/"]'));

  console.log('\n== Sidebar panel Planning menautkan Analytics ==');
  const PL = baca('deploy/konten/planning/index.html');
  cek('panelLainNav() dipanggil di renderSidebar', /\}\)\.join\(''\) \+ panelLainNav\(\);/.test(PL));
  cek('tautan Analytics hanya untuk pemegang campaign', /function panelLainNav\(\)\{[\s\S]{0,200}m\.includes\('campaign'\)/.test(PL));

  console.log('\n== Portal ==');
  const PORTAL = baca('deploy/index.html');
  cek('kartu Konten memegang kedua kunci', /key:'konten'[\s\S]{0,120}access:\['konten','campaign'\]/.test(PORTAL));
  cek('label Kelola Akses untuk kedua kunci', /accessLabels:\{ konten:'Konten · Konten Planning', campaign:'Konten · Analytics' \}/.test(PORTAL));

  console.log('\n====================================================');
  console.log('  OK: ' + ok + '   GAGAL: ' + gagal);
  console.log('====================================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => { console.error('UJI TIDAK SELESAI:', e); process.exit(1); });
