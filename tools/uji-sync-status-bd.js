/* uji-sync-status-bd.js — status task My Task & Daily Task harus sinkron antar
 * perangkat, walau jam perangkatnya tidak sama (18 Oktober 2026).
 *
 *   JSDOM_PATH=… node tools/uji-sync-status-bd.js
 *
 * Keluhan user: "status task yang ada di My Task dan Daily Task tidak sync".
 * Sebabnya: cap updatedAt diambil dari jam PERANGKAT, dan server menolak
 * diam-diam baris yang capnya lebih lama daripada yang tersimpan (penjaga
 * updated_at). HP yang jamnya tertinggal beberapa menit mengubah status,
 * server menolaknya, lalu polling mengembalikan status lama — dua layar
 * menyebut status berbeda untuk task yang sama.
 *
 * Dua jsdom menghadap SATU server tiruan yang meniru upsert_collection()
 * (VALUES(updated_at) >= updated_at). Tab B jamnya dimundurkan 10 menit.
 * Yang diukur ISI SERVER dan layar tab lain, bukan pesan di layar.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(daftar){ for(const p of daftar){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
let ok=0, gagal=0;
function cek(syarat, pesan){ if(syarat){ ok++; console.log('OK   '+pesan); } else { gagal++; console.log('GAGAL '+pesan); } }
function selesai(){ console.log(`\n${ok} lulus, ${gagal} gagal`); process.exit(gagal?1:0); }
if (!JSDOM_MOD) { console.log('LEWAT (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JSDOM_MOD;

const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) +
  '\nwindow.__uji={get DB(){return DB;},kirim:kirim,toggleTask:toggleTask,tarik:tarikServer,'+
  'get kotor(){return _kotor||_menyimpan;}};\n' + ASLI.slice(iTutup);

const KOL = ['people','projects','tasks','routines','coord','po','agenda','pr'];
const SRV = {}; KOL.forEach(k=>SRV[k]=new Map());
const SEKARANG = Date.now();
const iso = n => { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
SRV.people.set('p1',{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1',updatedAt:SEKARANG-9e5});
SRV.tasks.set('t1',{id:'t1',name:'Cek stok bar',daily:true,status:'To Do',progress:0,deadline:iso(0),
  pics:['p1'],pic:'p1',div:'Business Development',project:null,subtasks:[],dependsOn:[],updatedAt:SEKARANG-5000,createdAt:SEKARANG-5000});

function getAll(){ const o={}; KOL.forEach(k=>o[k]=[...SRV[k].values()].map(r=>JSON.parse(JSON.stringify(r)))); o.focus={}; o.approverSets=[]; o.promos=[]; return o; }
function saveAll(b){
  const st=b.data||{};
  KOL.forEach(k=>{ (st[k]||[]).forEach(r=>{ if(!r||!r.id) return;
    const lama=SRV[k].get(r.id);
    if(!lama || (+r.updatedAt||0) >= (+lama.updatedAt||0)) SRV[k].set(r.id, JSON.parse(JSON.stringify(r))); }); });
  return { saved:true, tsMs:Date.now() };
}
function buka(nama, geserJam){
  const dom = new JSDOM(ASLI === html ? html : html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
    runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#daily',
    beforeParse(w){
      if (geserJam){ const asli=w.Date.now.bind(w.Date); w.Date.now=()=>asli()+geserJam; }
      w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
      w.fetch = async (url, opts)=>{
        const u=String(url); let data;
        if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true}]};
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
async function siap(d){ for(let i=0;i<100;i++){ try{ if(d.window.__uji&&d.window.__uji.DB&&d.window.__uji.DB.tasks.length) return; }catch(e){} await tunggu(50);} throw new Error(d.nama+' tidak boot'); }
async function tenang(d){ await tunggu(900); for(let i=0;i<60 && d.window.__uji.kotor;i++) await tunggu(50); await tunggu(500); }
const statusDi = d => d.window.__uji.DB.tasks.find(t=>t.id==='t1').status;

(async ()=>{
  const A = buka('A', 0), B = buka('B', -10*60*1000);   // jam B tertinggal 10 menit
  await siap(A); await siap(B);
  cek(statusDi(A)==='To Do' && statusDi(B)==='To Do', 'kedua tab memuat task Daily berstatus To Do');

  A.window.__uji.toggleTask('t1'); await tenang(A);
  cek(SRV.tasks.get('t1').status==='Done', 'tab A (jam benar) menandai Done -> tersimpan di server');

  B.window.dispatchEvent(new B.window.Event('focus')); await tunggu(400);
  cek(statusDi(B)==='Done', 'tab B langsung menyusul begitu difokuskan (tidak menunggu 20 detik)');

  B.window.__uji.toggleTask('t1'); await tenang(B);
  cek(SRV.tasks.get('t1').status==='To Do', 'tab B (jam tertinggal 10 menit) membuka lagi -> server MENERIMA (bug aslinya: ditolak diam-diam)');
  cek(statusDi(B)==='To Do', 'layar tab B tidak berbalik ke status lama sesudah simpan');

  A.window.dispatchEvent(new A.window.Event('focus')); await tunggu(400);
  cek(statusDi(A)==='To Do', 'tab A ikut menunjukkan status terbaru');
  const htmlA = A.window.document.getElementById('content') ? A.window.document.body.innerHTML : A.window.document.body.innerHTML;
  cek(htmlA.indexOf('Cek stok bar')>-1, 'task tetap tergambar di layar tab A');

  // Bentrok SUNGGUHAN tetap dimenangkan yang lebih baru: server sudah punya
  // versi yang LEBIH BARU daripada yang dilihat tab A; suntingan tab A atas
  // versi lama tidak boleh menimpanya.
  const v = SRV.tasks.get('t1'); v.status='Review'; v.updatedAt=Date.now()+60*60*1000; SRV.tasks.set('t1',v);
  A.window.__uji.toggleTask('t1'); await tenang(A);
  cek(SRV.tasks.get('t1').status==='Review', 'penjaga bentrok sungguhan tidak dilonggarkan');
  cek(statusDi(A)==='Review', 'yang kalah bentrok langsung melihat status server');
  selesai();
})().catch(e=>{ console.log('GAGAL uji tidak selesai: '+(e&&e.stack||e)); gagal++; selesai(); });
