#!/usr/bin/env node
/* Smoke test frontend modul Laksamana Office.
   ---------------------------------------------------------------------------
   Repo ini tidak punya test suite, dan modulnya berkas HTML mandiri — jadi
   seluruh frontend bisa dirender di Node dengan jsdom tanpa server sama sekali.
   Ini pengganti termurah untuk "coba buka di browser", dan menangkap kerusakan
   yang paling sering lolos: satu TypeError di satu halaman membuat halaman itu
   BLANK, dan tidak ada yang sadar sampai ada yang membukanya.

   Pemakaian:
       node tools/smoke-modul.js marketing
       node tools/smoke-modul.js              # semua modul yang punya router

   Keluar dengan kode 1 kalau ada halaman yang melempar.

   CATATAN PENTING soal jsdom di repo ini:
   `S` (state) dan `ME` (user) dideklarasikan dengan `let` di lingkup global
   skrip, jadi keduanya BUKAN properti window. Menulis `dom.window.S = ...`
   dari Node tidak akan terlihat oleh kode halaman — harus lewat
   `dom.window.eval(...)`, yang berjalan di lingkup leksikal yang sama.
   =========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { JSDOM } = require(path.join(ROOT, 'node_modules', 'jsdom'));

/* Data contoh secukupnya supaya tiap halaman punya sesuatu untuk digambar.
   Halaman yang kosong melompong tidak menguji apa-apa: banyak bug hanya muncul
   saat ada baris yang benar-benar dirender. */
const CONTOH = {
  users: [
    { id: 'u1', name: 'Uji Superadmin', role: 'super_admin', div: 'Event', jabatan: 'Owner', hp: '08120000001', active: true },
    { id: 'u2', name: 'Uji Marketing',  role: 'marketing',   div: 'Marketing', hp: '08120000002', active: true },
    { id: 'u3', name: 'Uji Operasional',role: 'operational', div: 'Bar', hp: '', active: true }
  ],
  clients: [
    { id: 'c1', nama: 'PT Uji Coba', perusahaan: 'PT Uji Coba', pic: 'Andi', hp: '08110000001',
      source: 'Instagram', mktPIC: 'u2', createdAt: '2026-07-01', lastContact: '2026-07-02', nextFU: '2026-08-01' }
  ],
  events: [
    { id: 'e1', clientId: 'c1', nama: 'Event Uji', jenis: 'Gathering', tanggal: '2026-08-05',
      status: 'Deal', pipeCol: 'Deal', mktPIC: 'u2', pax: 100, payments: [], tasks: {},
      detail: { fbFormat: 'Prasmanan', sewaVenue: 5000000, biayaTeknis: 2000000, budgetPax: 75000 },
      penawaran: { status: 'Menunggu Approval', noSurat: '001/PNW/LM/VIII/2026',
                   submittedBy: 'u2', submittedAt: '2026-07-20T03:00:00Z', validUntil: '2026-08-01' } }
  ],
  approvals: [{ id: 'a1', eventId: 'e1', by: 'u2', at: '2026-07-20T03:00:00Z', reason: 'diskon 15%', status: 'Pending' }],
  followups: [{ id: 'f1', clientId: 'c1', by: 'u2', at: '2026-07-20T03:00:00Z' }],
  activities: [{ at: '2026-07-20T03:00:00Z', by: 'Uji Marketing', refType: 'event', refId: 'e1', action: 'Event dibuat', detail: '' }],
  notifs: [{ id: 'n1', type: 'approval', title: 'Uji', body: 'contoh notifikasi', at: '2026-07-20T03:00:00Z', read: false }],
  taskTemplates: [{ id: 'tt1', div: 'Prasmanan', sub: 'Appetizer', task: 'Siapkan salad', pic: 'Uji Operasional', hminus: 3 }],
  fbSubs: [{ id: 'sc1', div: 'Prasmanan', nama: 'Appetizer' }]
};

function bukaModul(modul) {
  const file = path.join(ROOT, 'deploy', modul, 'index.html');
  if (!fs.existsSync(file)) throw new Error('modul tidak ada: ' + file);
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'dangerously',
    url: 'http://localhost/office/' + modul + '/',
    beforeParse(w) {
      // Offline disengaja: boot modul memang harus tetap jalan tanpa server.
      w.fetch = () => Promise.reject(new Error('offline (smoke test)'));
      w.scrollTo = () => {};
      w.print = () => {};
      w.alert = () => {};
      w.confirm = () => true;
      w.prompt = () => 'uji';
      w.matchMedia = w.matchMedia || (() => ({ matches: false, media: '', onchange: null,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
    }
  });
  return dom;
}

async function ujiModul(modul) {
  const dom = bukaModul(modul);
  const w = dom.window;
  const px = (src) => w.eval(src);
  const errs = [];

  await new Promise(r => setTimeout(r, 1500));   // beri kesempatan boot() selesai

  // --- siapkan state & identitas -------------------------------------------
  try {
    px('if (typeof normalizeState === "function" && typeof seed === "function") S = normalizeState(seed());');
    px('if (typeof save === "function") save = function(){};');   // jangan menembak server
    const punyaS = px('typeof S !== "undefined" && !!S');
    if (punyaS) {
      for (const [k, v] of Object.entries(CONTOH)) {
        px(`if (S.${k} !== undefined || true) S.${k} = ${JSON.stringify(v)};`);
      }
      px('if (typeof ME !== "undefined") ME = S.users[0];');
      px('if (typeof API_READY !== "undefined") API_READY = true;');
      px('if (typeof buildNav === "function") buildNav();');
    }
  } catch (e) {
    errs.push('SIAPKAN STATE: ' + e.message);
  }

  // --- daftar halaman ------------------------------------------------------
  let views = [];
  try {
    views = px('(typeof NAV_DEF !== "undefined" && Array.isArray(NAV_DEF)) ? NAV_DEF.filter(x=>x&&x.k).map(x=>x.k) : []') || [];
    if (!views.length) views = px('(typeof TITLES !== "undefined") ? Object.keys(TITLES) : []') || [];
  } catch (_) {}

  const punyaGo = px('typeof go === "function"');
  if (!punyaGo || !views.length) {
    /* Tidak semua modul punya router bernama go() + daftar halaman yang bisa
       dibaca dari NAV_DEF/TITLES. Untuk modul itu yang bisa diuji hanya "boot
       tidak melempar dan menghasilkan sesuatu" — tetap berguna, tapi jangan
       dikira cakupan penuh. */
    const teks = (w.document.body.textContent || '').trim();
    if (!teks) errs.push('boot: halaman kosong sama sekali');
    const sebab = !punyaGo ? 'tidak ada go()' : 'daftar halaman tak terbaca dari NAV_DEF/TITLES';
    return { modul, views: 0, errs, catatan: 'hanya boot yang diuji (' + sebab + ')' };
  }

  /* Wadah render tiap modul berbeda-beda (#view di marketing, elemen lain di
     kompas). Kalau tidak ketemu, pemeriksaan "kosong" DILEWATI dan yang diuji
     tinggal "render tidak melempar" — lebih baik daripada melaporkan gagal
     palsu untuk modul yang sebenarnya sehat. */
  const wadah = ['view', 'main', 'content', 'page', 'app']
    .map(id => w.document.getElementById(id))
    .find(el => el);

  views.forEach(v => {
    try { px(`go(${JSON.stringify(v)})`); }
    catch (e) { errs.push(v + ': ' + e.message); return; }
    // Halaman yang render-nya diam-diam tidak menghasilkan apa pun juga rusak.
    if (wadah && !(wadah.textContent || '').trim()) errs.push(v + ': wadah render kosong');
  });

  return { modul, views: views.length, errs,
           catatan: wadah ? '' : 'wadah render tak dikenali — hanya dicek tidak melempar' };
}

async function main() {
  const diminta = process.argv.slice(2);
  const daftar = diminta.length ? diminta : fs.readdirSync(path.join(ROOT, 'deploy'))
    .filter(d => fs.existsSync(path.join(ROOT, 'deploy', d, 'index.html')));

  let gagal = 0;
  for (const m of daftar) {
    let hasil;
    try { hasil = await ujiModul(m); }
    catch (e) { console.log(`GAGAL  ${m} — tidak bisa dimuat: ${e.message}`); gagal++; continue; }

    if (hasil.errs.length) {
      gagal++;
      console.log(`GAGAL  ${m} (${hasil.views} halaman)`);
      hasil.errs.forEach(x => console.log('       · ' + x));
    } else {
      console.log(`OK     ${m} (${hasil.views} halaman)${hasil.catatan ? ' — ' + hasil.catatan : ''}`);
    }
  }
  process.exit(gagal ? 1 : 0);
}

main();
