/* uji-dikenal-bd.js — saveAll BD OS hanya boleh menghapus baris yang PERNAH
 * DILIHAT tab pengirim (24 September 2026).
 *
 *   JSDOM_PATH=… node tools/uji-dikenal-bd.js
 *
 * Sebabnya: PR-11 berikut PO "Pelunasan DJ" lenyap senyap di produksi. Tab
 * yang basi menyimpan, _sinceTs dimajukan ke jam server, lalu simpan
 * berikutnya menghapus baris yang lahir di tab lain SEBELUM jam itu.
 *
 * Server tiruannya MENIRU ATURAN PHP (upsert_collection): kalau `dikenal`
 * dikirim, yang dihapus = dikenal − kiriman; kalau tidak, aturan lama
 * (updated_at <= sinceTs). Yang diuji: skenario dua tab yang sesungguhnya,
 * dua jsdom menghadap satu server. PHP-nya sendiri dijaga lewat php-parser
 * (sintaks) + kontrak atas sumber — tidak ada php di mesin pengembangan.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(daftar){ for(const p of daftar){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
const PHP_MOD   = muat([process.env.PHP_PARSER_PATH, path.join(ROOT,'node_modules','php-parser'), 'php-parser']);

let ok=0, gagal=0;
function cek(syarat, pesan){ if(syarat){ ok++; console.log('OK   '+pesan); } else { gagal++; console.log('GAGAL '+pesan); } }

/* ---------- 1. PHP: sintaks + kontrak ---------- */
const libSrc = fs.readFileSync(path.join(ROOT,'bd-mysql','lib_bd_mysql.php'),'utf8');
const apiSrc = fs.readFileSync(path.join(ROOT,'bd-mysql','api.php'),'utf8');
if (PHP_MOD) {
  const Engine = PHP_MOD.Engine || PHP_MOD;
  const parser = new Engine({ parser:{ php8:true, suppressErrors:false }, ast:{} });
  for (const [n,s] of [['lib_bd_mysql.php',libSrc],['api.php',apiSrc]]) {
    let e=null; try{ parser.parseCode(s,n); }catch(x){ e=x; }
    cek(!e, 'sintaks PHP '+n+(e?' — '+e.message:''));
  }
} else console.log('LEWAT parse-check PHP (php-parser tidak ada)');

const badanUpsert = libSrc.slice(libSrc.indexOf('function upsert_collection('), libSrc.indexOf('function hapus_yang_hilang('));
cek(badanUpsert.indexOf('if (is_array($kenal))') > -1, 'upsert_collection punya jalur `dikenal`');
cek(/array_diff\(array_map\('strval', \$kenal\), \$ids\)/.test(badanUpsert), 'yang dihapus = dikenal − kiriman');
cek(badanUpsert.indexOf('if (is_array($kenal))') < badanUpsert.lastIndexOf('hapus_yang_hilang('),
    'jalur `dikenal` MENDAHULUI aturan lama (sinceTs)');
cek(/return count\(\$ids\);\s*\}\s*\n\s*hapus_yang_hilang/.test(badanUpsert), 'jalur `dikenal` tidak jatuh ke aturan lama');
cek(apiSrc.indexOf("$body['dikenal']") > -1, 'api.php meneruskan `dikenal` ke save_all');
cek(/upsert_collection\(\$pdo, \$c, \$rows, \$sinceTs, \$kenal\)/.test(libSrc), 'save_all menyerahkan daftar per koleksi');

/* ---------- 2. Dua tab, satu server ---------- */
if (!JSDOM_MOD) { console.log('LEWAT uji dua tab (jsdom tidak ada)'); selesai(); return; }
const { JSDOM } = JSDOM_MOD;
const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
/* Modul BD dibungkus IIFE: DB/kirim/_kotor TIDAK ada di window. Jembatan
   disuntikkan DI DALAM pembungkusnya, di salinan memori — pola uji-vendor.js. */
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) +
  '\nwindow.__uji={get DB(){return DB;},set DB(v){DB=v;},kirim:kirim,setKotor:function(){_kotor=true;}};\n' +
  ASLI.slice(iTutup);

// server tiruan: meniru upsert_collection + hapus_yang_hilang
const KOL = ['people','projects','tasks','routines','coord','po','agenda','pr'];
const SRV = { tabel:{}, focus:{}, approverSets:[], promos:[] };
KOL.forEach(k=>SRV.tabel[k]=new Map());
let jam = Date.now() - 60000;   // sejalan dengan Date.now() klien — kalau tidak, bug aslinya tak bisa muncul
const tik = ()=> (jam = Math.max(jam + 1, Date.now()));
const catat = [];
function getAll(){
  const o={}; KOL.forEach(k=>o[k]=[...SRV.tabel[k].values()].map(r=>JSON.parse(JSON.stringify(r))));
  o.focus={}; o.approverSets=[]; o.promos=[]; o._serverTs=tik(); return o;
}
function saveAll(body){
  const st=body.data||{}, since=+body.sinceTs||0, dik=body.dikenal||null;
  catat.push(body);
  KOL.forEach(k=>{
    if(!(k in st)) return;
    const t=SRV.tabel[k], ids=[];
    (st[k]||[]).forEach(r=>{ if(!r||!r.id) return; ids.push(String(r.id));
      const lama=t.get(r.id); if(!lama || (+r.updatedAt||0) >= (+lama.updatedAt||0)) t.set(r.id, JSON.parse(JSON.stringify(r))); });
    if (dik && Array.isArray(dik[k])) {
      const hapus=dik[k].map(String).filter(id=>ids.indexOf(id)<0);
      if (hapus.length && !(ids.length===0 && hapus.length>3)) hapus.forEach(id=>t.delete(id));
    } else if (since>0) {
      [...t.values()].forEach(r=>{ if(ids.indexOf(String(r.id))<0 && (+r.updatedAt||0)<=since) t.delete(r.id); });
    }
  });
  return { saved:true, tsMs:tik() };
}
// isi awal: PR-10 berikut satu PO
SRV.tabel.pr.set('pr10',{id:'pr10',no:'10',nama:'Wandi',dept:'BD',tanggal:'2026-09-16',status:'Disetujui',updatedAt:jam-5000,createdAt:jam-5000});
SRV.tabel.po.set('poA',{id:'poA',item:'Kopi',amount:1000,qty:1,unit:'Unit',prId:'pr10',status:'Diajukan',updatedAt:jam-5000,createdAt:jam-5000});

function buka(nama){
  const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
    runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/',
    beforeParse(w){
      w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
      w.fetch = async (url, opts)=>{
        const u=String(url); let data;
        if (u.indexOf('account-api')>-1) data={ok:true,members:[]};
        else if (u.indexOf('action=getAll')>-1) data={ok:true,data:getAll()};
        else if (opts && opts.body){ const b=JSON.parse(opts.body); data = b.action==='saveAll' ? {ok:true,data:saveAll(b)} : {ok:true,data:{}}; }
        else data={ok:true,data:{}};
        const teks=JSON.stringify(data);
        return { ok:true, status:200, text:async()=>teks, json:async()=>JSON.parse(teks) };
      };
      w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
    }
  });
  dom.nama=nama; return dom;
}
const tunggu = ms => new Promise(r=>setTimeout(r,ms));
async function sampaiSiap(dom){ for(let i=0;i<100;i++){ try{ if(dom.window.__uji && dom.window.__uji.DB) return; }catch(e){} await tunggu(50); } throw new Error(dom.nama+' tidak boot'); }
/* Potongan dijalankan dengan DB milik IIFE; penugasan ulang DB ditulis balik. */
const ev = (dom, s) => dom.window.eval('(function(){var DB=window.__uji.DB;var r=(function(){'+s+'})();window.__uji.DB=DB;return r;})()');
async function simpan(dom){ dom.window.__uji.setKotor(); await dom.window.__uji.kirim(); }

(async ()=>{
  const A = buka('A'), B = buka('B');
  await sampaiSiap(A); await sampaiSiap(B);
  cek(ev(A,'return DB.pr.length')===1 && ev(B,'return DB.pr.length')===1, 'kedua tab memuat PR-10');

  // Tab B membuat PR-11 + PO "Pelunasan DJ"
  ev(B, `DB.pr.push({id:'pr11',no:'11',nama:'Wandi',dept:'BD',tanggal:'2026-09-23',status:'Diajukan'});
         DB.po.push({id:'poDJ',item:'Pelunasan DJ',amount:5000000,qty:1,unit:'Unit',prId:'pr11',status:'Diajukan'});
         DB.po.push({id:'poTiket',item:'Tiket Pesawat',amount:5551760,qty:1,unit:'Unit',prId:'pr11',status:'Diajukan'});`);
  await simpan(B);
  cek(SRV.tabel.pr.has('pr11') && SRV.tabel.po.has('poDJ'), 'PR-11 & Pelunasan DJ tersimpan di server');

  // Tab A basi (tidak pernah polling) menyimpan DUA KALI
  ev(A, `DB.po.find(p=>p.id==='poA').amount=2000;`); await simpan(A);
  cek(SRV.tabel.pr.has('pr11'), 'simpan PERTAMA tab basi tidak menghapus PR-11');
  ev(A, `DB.po.find(p=>p.id==='poA').amount=3000;`); await simpan(A);
  cek(SRV.tabel.pr.has('pr11'), 'simpan KEDUA tab basi tidak menghapus PR-11 (bug aslinya)');
  cek(SRV.tabel.po.has('poDJ'), 'PO Pelunasan DJ tetap ada');
  const kirimA = catat.filter(b=>b.dikenal && (b.data.po||[]).some(p=>p.id==='poA' && p.amount===3000)).pop();
  cek(kirimA && kirimA.dikenal.pr.indexOf('pr11')<0, 'daftar dikenal tab A tidak memuat PR-11 yang tak pernah dilihatnya');

  // Penghapusan sungguhan tetap jalan: tab A menghapus PR-10 yang memang dilihatnya
  ev(A, `DB.po.forEach(p=>{ if(p.prId==='pr10') p.prId=null; }); DB.pr=DB.pr.filter(x=>x.id!=='pr10');`);
  await simpan(A);
  cek(!SRV.tabel.pr.has('pr10'), 'PR yang dilihat & dihapus tab itu benar-benar terhapus');

  // Baris yang dibuat tab ini lalu dihapus sebelum polling tetap terhapus
  ev(A, `DB.po.push({id:'poBaru',item:'Coba',amount:1,qty:1,unit:'Unit',status:'Diajukan'});`); await simpan(A);
  cek(SRV.tabel.po.has('poBaru'), 'baris baru dari tab A tersimpan');
  ev(A, `DB.po=DB.po.filter(p=>p.id!=='poBaru');`); await simpan(A);
  cek(!SRV.tabel.po.has('poBaru'), 'baris baru yang langsung dihapus tab yang sama ikut terhapus');

  // Aksi selain saveAll tidak membawa dikenal
  cek(catat.every(b=>b.action==='saveAll'), 'dikenal hanya dikirim untuk saveAll');
  selesai();
})().catch(e=>{ console.log('GAGAL uji tidak selesai: '+(e&&e.stack||e)); gagal++; selesai(); });

function selesai(){ console.log(`\n${ok} lulus, ${gagal} gagal`); process.exit(gagal?1:0); }
