/* uji-kalender-add-event.js — modul Marketing, Kalender (23 Oktober 2026)
 *
 *   node tools/uji-kalender-add-event.js
 *
 * Permintaan user: menekan tanggal di Kalender memunculkan popup berisi
 * jadwal hari itu + tombol Add Event; formulir Event Baru lalu terbuka
 * dengan tanggal yang ditekan sudah terisi.
 *
 * Yang dijaga:
 *  - sel tanggal benar-benar DITEKAN (MouseEvent), bukan fungsinya dipanggil;
 *  - menekan PITA event membuka popup event itu SAJA (stopPropagation),
 *    bukan popup hari yang menimpanya;
 *  - daftarnya memakai penyaring yang sama dengan selnya (event Lost tidak ikut);
 *  - tombol Add Event mengikuti can('edit_event');
 *  - tanggal rusak tidak dioper ke <input type=date>.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue; try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH.'); process.exit(2);
})();

let ok = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { ok++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  — ' + k : '')); } };
const SRC = fs.readFileSync(path.join(ROOT, 'deploy/marketing/index.html'), 'utf8');

function buka(role) {
  const html = SRC
    .replace(/<script[^>]*\ssrc="[^"]*performa-bonus\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/performa-bonus.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc="[^"]*venue-layouts\.js"[^>]*><\/script>/i,
      '<script>' + fs.readFileSync(path.join(ROOT, 'deploy/assets/venue-layouts.js'), 'utf8') + '</script>')
    .replace(/<script[^>]*\ssrc=[^>]*><\/script>/gi, '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const t = String((e && e.detail && e.detail.stack) || (e && e.message) || e);
    if (!/Not implemented|Could not parse CSS/.test(t)) console.log('  !! ' + t.split('\n')[0]);
  });
  const dom = new JSDOM(html, { virtualConsole: vc, runScripts: 'dangerously',
    url: 'https://dev.laksamanamuda.id/marketing/',
    beforeParse(w) {
      w.localStorage.setItem('lm_session', JSON.stringify({ id: 'u1', name: 'Ayu', modules: ['marketing'],
        adminModules: role === 'super_admin' ? ['marketing'] : [], token: 't', expiry: Date.now() + 86400000 }));
      w.fetch = () => new Promise(() => {});
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {}; w.confirm = () => true;
      w.Chart = class { destroy() {} update() {} };
      w.HTMLCanvasElement.prototype.getContext = () => ({});
    } });
  const w = dom.window;
  w.eval('S = normalizeState(seed());');
  w.eval(`
    S.users = [{ id:'u1', name:'Ayu', jabatan:'Marketing', div:'Marketing', role:${JSON.stringify(role)} }];
    ME = S.users[0];
    S.clients = [{ id:'c1', nama:'PT Uji' }];
    S.events = [
      { id:'e1', nama:'Gathering PT Uji', jenis:'Corporate Event', status:'Deal', tanggal:'2026-11-12', pax:80, clientId:'c1', mktPIC:'u1', detail:{} },
      { id:'e2', nama:'Acara Kalah', jenis:'Birthday', status:'Lost', tanggal:'2026-11-12', pax:20, clientId:'c1', detail:{} },
    ];
    calDate = new Date(2026, 10, 1); calStatusFilter='';
    go('calendar');
  `);
  return w;
}
const klik = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const modalHtml = w => w.document.getElementById('modal').innerHTML;
const modalBuka = w => w.document.getElementById('modal-bg').classList.contains('on');

console.log('-- Popup hari --');
let w = buka('super_admin');
const sel = [...w.document.querySelectorAll('.cal .cell.cal-klik')].find(c => /calHariPopup\('2026-11-12'\)/.test(c.getAttribute('onclick') || ''));
cek('sel 12 Nov bisa ditekan', !!sel);
cek('sel bulan sebelah TIDAK bisa ditekan', [...w.document.querySelectorAll('.cal .cell.other')].every(c => !c.getAttribute('onclick')));
klik(w, sel);
cek('popup hari terbuka', modalBuka(w) && /Kalender/.test(modalHtml(w)) && /12 November 2026/.test(modalHtml(w)), modalHtml(w).slice(0, 200));
cek('popup memuat event di tanggal itu', /Gathering PT Uji/.test(modalHtml(w)));
cek('event Lost TIDAK ikut (penyaring sama dengan sel)', !/Acara Kalah/.test(modalHtml(w)));
const btnAdd = [...w.document.querySelectorAll('#modal button')].find(b => /Add Event/.test(b.textContent));
cek('ada tombol Add Event', !!btnAdd);
klik(w, btnAdd);
const tgl = w.document.getElementById('ne_tanggal');
cek('formulir Event Baru terbuka', !!tgl && /Event Baru/.test(modalHtml(w)));
cek('tanggal terisi tanggal yang ditekan', tgl && tgl.value === '2026-11-12', tgl && tgl.value);

console.log('-- Pita event tetap membuka popupnya sendiri --');
w.eval("closeModal(); go('calendar')");
const pita = [...w.document.querySelectorAll('.cal .ev')].find(e => /Gathering PT Uji/.test(e.textContent));
klik(w, pita);
cek('yang terbuka popup EVENT, bukan popup hari', /Buka Detail Event/.test(modalHtml(w)) && !/Add Event/.test(modalHtml(w)), modalHtml(w).slice(0, 160));

console.log('-- Hari kosong & tanggal rusak --');
w.eval("closeModal(); calHariPopup('2026-11-20')");
cek('hari kosong menyebut belum ada jadwal', /Belum ada jadwal/.test(modalHtml(w)));
w.eval("closeModal(); newEvent('bukan-tanggal')");
cek('tanggal rusak jatuh ke hari ini', w.document.getElementById('ne_tanggal').value === w.eval('today()'));
w.eval("closeModal(); newEvent()");
cek('Event Baru tanpa argumen tetap hari ini', w.document.getElementById('ne_tanggal').value === w.eval('today()'));

console.log('-- Izin --');
const w2 = buka('viewer');
const tanpaIzin = !w2.eval("can('edit_event')");
w2.eval("calHariPopup('2026-11-12')");
cek('tanpa izin edit_event: daftar tetap tampil', /Gathering PT Uji/.test(modalHtml(w2)));
cek('dasar: role viewer memang tanpa izin edit_event', tanpaIzin);
cek('tanpa izin edit_event: tombol Add Event tidak ada', !/Add Event/.test(modalHtml(w2)), 'can(edit_event)=' + !tanpaIzin);

console.log('\n---------------------------------------');
console.log(`LULUS ${ok}   GAGAL ${gagal}`);
process.exit(gagal ? 1 : 0);
