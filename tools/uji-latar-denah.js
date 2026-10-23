/* uji-latar-denah.js — modul Reservasi, 23 Oktober 2026.

   Dua permintaan user di satu pesan:
   1. Latar denah (Stage, Meja DJ, Entrance) bisa DIMATIKAN per denah lewat
      Editor Denah. Yang dimatikan disimpan sebagai fx.hidden — bukan dihapus —
      dan seluruh penggambar (Reservasi, Marketing, Service Excellent) wajib
      menyaringnya.
   2. "Tanggal 24 sudah saya pindahkan ke template Weekend tapi denahnya tidak
      berubah": tanggal itu punya DENAH KHUSUS (layoutTanggal), yang selalu
      menang atas jadwal template. Memilih template sekarang menanyakan lalu
      membuang denah khususnya; menjawab Batal tidak mengubah apa pun.

   node tools/uji-latar-denah.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { JSDOM, VirtualConsole } = (() => {
  for (const p of [process.env.JSDOM_PATH, path.join(ROOT, 'node_modules', 'jsdom'), 'jsdom']) {
    if (!p) continue; try { return require(p); } catch (e) {}
  }
  console.error('jsdom tidak ketemu. Pasang `npm i jsdom`, atau setel JSDOM_PATH.'); process.exit(2);
})();

const ASSET = fs.readFileSync(path.join(ROOT, 'deploy', 'assets', 'venue-layouts.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'deploy', 'reservasi', 'index.html'), 'utf8');
const SRC_MKT = fs.readFileSync(path.join(ROOT, 'deploy', 'marketing', 'index.html'), 'utf8');
const SRC_SE = fs.readFileSync(path.join(ROOT, 'deploy', 'service_excellent', 'index.html'), 'utf8');
const HTML_UJI = SRC.replace('<script src="../assets/venue-layouts.js"><' + '/script>', () => '<script>' + ASSET + '<' + '/script>');
if (HTML_UJI === SRC) { console.error('tag venue-layouts.js tidak ketemu'); process.exit(2); }

let lulus = 0, gagal = 0;
const cek = (n, s, k) => { if (s) { lulus++; console.log('  OK   ' + n); } else { gagal++; console.log('  GAGAL ' + n + (k ? '  -> ' + k : '')); } };
const tunggu = ms => new Promise(r => setTimeout(r, ms));
const TGL = '2026-10-24';   // Sabtu

function dom(jawab) {
  const tglLama = JSON.parse(JSON.stringify(ASSET_LAYOUT('weekday')));
  tglLama.name = 'Denah 24 Okt 2026 · Lt.1';
  const srv = { reservations: [{ id: 'r1', name: 'Uji', phone: '0812', date: '2026-12-01', time: '19:00', pax: 2,
      table: '21', status: 'Confirmed', dps: [], arrivals: [], createdAt: 1, updatedAt: 1 }],
    master: { layoutTanggal: { ['tgl:' + TGL + ':1']: tglLama }, layoutOverrides: {} }, audit: [], _ver: 1 };
  const jejak = { tanya: [], simpan: 0 };
  const d = new JSDOM(HTML_UJI, {
    url: 'https://team.laksamanamuda.id/reservasi/', runScripts: 'dangerously', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(w) {
      w.alert = () => {}; w.print = () => {}; w.scrollTo = () => {};
      w.confirm = m => { jejak.tanya.push(String(m)); return jawab; };
      w.HTMLElement.prototype.scrollIntoView = function () {};
      try { w.localStorage.setItem('lm_session', JSON.stringify({ expiry: Date.now() + 3600000, userId: 'u', name: 'Penguji', modules: ['reservasi'], adminModules: ['reservasi'] })); } catch (e) {}
      w.fetch = async (url, init) => {
        const u = String(url);
        const balas = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o), json: async () => o });
        if (u.indexOf('account-api') > -1) return balas({ ok: true, members: [{ id: 'u', name: 'Penguji', isModuleAdmin: true }] });
        if (init && init.method === 'POST') {
          const b = JSON.parse(init.body || '{}');
          if (b.action === 'saveAll') { jejak.simpan++; srv.master = JSON.parse(JSON.stringify(b.data.master || {})); srv._ver++; return balas({ ok: true, data: { saved: true, ver: srv._ver } }); }
          return balas({ ok: true, data: {} });
        }
        if (u.indexOf('action=getAll') > -1) return balas({ ok: true, data: JSON.parse(JSON.stringify(srv)) });
        return balas({ ok: true, data: {} });
      };
    },
  });
  return { w: d.window, jejak, srv };
}
function ASSET_LAYOUT(k) { const w = {}; new Function('window', ASSET)(w); return (w.LM_VENUE_LAYOUTS || {})[k]; }
async function masuk(w) {
  for (let i = 0; i < 240; i++) { try { if (w.eval('typeof STATE!=="undefined"&&STATE&&STATE.reservations.length>0&&DATA_LOADED')) break; } catch (e) {} await tunggu(50); }
  w.eval('SESSION={id:"u",name:"Penguji",role:"admin"}; window.__toast=[]; toast=function(m){window.__toast.push(String(m))};');
}

(async () => {
  console.log('\n== 0. Aset ==');
  cek('denah bawaan weekend punya MEJA DJ (dasar uji)', (ASSET_LAYOUT('weekend') || {}).fixed.some(f => f.t === 'dj'));

  console.log('\n== 1. Latar bisa dimatikan di Editor Denah ==');
  {
    const { w } = dom(true); await masuk(w);
    w.eval('openLayoutEditor("weekend")');
    const panel = w.document.body.innerHTML;
    cek('panel "Latar Denah" tampil', panel.indexOf('Latar Denah') > -1);
    const kotak = [...w.document.querySelectorAll('label.le-latar input[type=checkbox]')];
    cek('satu centang per latar, semuanya menyala', kotak.length === ASSET_LAYOUT('weekend').fixed.length && kotak.every(k => k.checked), kotak.length);
    const iDj = ASSET_LAYOUT('weekend').fixed.findIndex(f => f.t === 'dj');
    kotak[iDj].checked = false; kotak[iDj].dispatchEvent(new w.Event('change', { bubbles: true }));
    cek('mematikan menandai hidden, TIDAK menghapus', w.eval(`LE.data.fixed.length===${kotak.length} && LE.data.fixed[${iDj}].hidden===true`));
    cek('editor menandai ada perubahan', w.eval('LE.dirty===true'));
    const djCanvas = w.document.querySelector('#leCanvas .seat-dj');
    cek('di kanvas editor tetap terlihat SAMAR (posisinya tidak dilupakan)', djCanvas && /opacity:\s*\.22/.test(djCanvas.getAttribute('style')));
    const k2 = w.document.querySelectorAll('label.le-latar input')[iDj];
    cek('centangnya ikut mati sesudah digambar ulang', k2 && !k2.checked);
    w.eval('leSave()'); await tunggu(400);
    cek('tersimpan di template weekend', w.eval(`customLayouts().weekend.fixed[${iDj}].hidden===true`));
    const html = w.eval('seatMapMarkup("weekend","view",new Map(),new Map())');
    cek('denah (Hari-H/form) TIDAK menggambar Meja DJ', html.indexOf('seat-dj') === -1);
    cek('Stage tetap digambar', html.indexOf('seat-stage') > -1);
    // nyalakan lagi
    w.eval('openLayoutEditor("weekend")');
    const k3 = w.document.querySelectorAll('label.le-latar input')[iDj];
    k3.checked = true; k3.dispatchEvent(new w.Event('change', { bubbles: true }));
    cek('menyalakan lagi mencabut hidden', w.eval(`LE.data.fixed[${iDj}].hidden===undefined`));
  }

  console.log('\n== 2. Template untuk tanggal yang punya denah khusus ==');
  {
    const { w, jejak } = dom(true); await masuk(w);
    cek('dasar: 24 Okt memakai denah khusus', w.eval(`dayTypeLayoutLt("${TGL}",1)==="tgl:${TGL}:1"`));
    w.eval(`openLayoutSettings(1)`);
    // pilih radio weekend lalu Terapkan
    w.eval(`(function(){ const r=document.querySelector('input[name=lyov][value="weekend"]'); r.checked=true; })(); saveLayoutOverride("${TGL}",1)`);
    await tunggu(300);
    cek('ditanya dulu, dan pertanyaannya menyebut denah khusus', jejak.tanya.some(t => /DENAH KHUSUS/.test(t)), jejak.tanya.join(' | '));
    cek('denah khusus dibuang', w.eval(`!layoutTanggal()["tgl:${TGL}:1"]`));
    cek('jadwal weekend tersimpan', w.eval(`ovLantai(1)["${TGL}"]==="weekend"`));
    cek('SEKARANG 24 Okt benar-benar memakai Weekend', w.eval(`dayTypeLayoutLt("${TGL}",1)==="weekend"`));
  }
  {
    const { w, jejak } = dom(false); await masuk(w);
    w.eval(`openLayoutSettings(1)`);
    w.eval(`(function(){ const r=document.querySelector('input[name=lyov][value="weekend"]'); r.checked=true; })(); saveLayoutOverride("${TGL}",1)`);
    await tunggu(200);
    cek('Batal: denah khusus TETAP ada', w.eval(`!!layoutTanggal()["tgl:${TGL}:1"]`));
    cek('Batal: jadwal TIDAK ditulis (bukan setengah jadi)', w.eval(`!ovLantai(1)["${TGL}"]`));
    jejak.tanya.length = 0;
    w.eval(`openLayoutSettings(1)`);
    w.eval(`document.getElementById("lyAddDate").value="${TGL}"; (function(){ const r=document.querySelector('input[name=lyov][value="weekend"]'); r.checked=true; })(); addLayoutDate(1)`);
    cek('"Terapkan ke banyak tanggal" juga bertanya', jejak.tanya.some(t => /DENAH KHUSUS/.test(t)));
    cek('...dan Batal juga tidak menulis jadwalnya', w.eval(`!ovLantai(1)["${TGL}"]`));
  }

  console.log('\n== 3. Modul lain menyaring fx.hidden ==');
  cek('Marketing: kedua penggambar denah menyaring hidden', (SRC_MKT.match(/\(L\.fixed\|\|\[\]\)\.filter\(/g) || []).length === 2);
  cek('Service Excellent: penggambar denah menyaring hidden', /\(L\.fixed\|\|\[\]\)\.filter\(fx=>!fx\.hidden\)/.test(SRC_SE));

  console.log('\n---------------------------------------');
  console.log(`LULUS ${lulus}   GAGAL ${gagal}`);
  process.exit(gagal ? 1 : 0);
})();
