/* uji-subassign-cari-bd.js — tiga permintaan user 18 Okt 2026 di modul BD:
 *   1. sub-task bisa di-assign ke kru
 *   2. kotak cari menggambar DAFTAR hasil (dulu langsung membuka hasil pertama)
 *   3. Projects punya tampilan Task, disaring menurut assign
 *
 *   JSDOM_PATH=… node tools/uji-subassign-cari-bd.js
 *
 * Server tiruan HIDUP: apa yang ditulis saveAll dipulangkan getAll berikutnya,
 * jadi yang diukur ISI SERVER sesudah simpan, bukan cuma layar.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(d){ for(const p of d){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
let ok=0, gagal=0;
function cek(s,m){ if(s){ok++;console.log('OK   '+m);} else {gagal++;console.log('GAGAL '+m);} }
function selesai(){ console.log(`\n${ok} lulus, ${gagal} gagal`); process.exit(gagal?1:0); }
if(!JSDOM_MOD){ console.log('LEWAT (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JSDOM_MOD;

const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iT = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iT) + '\nwindow.__uji={get DB(){return DB;},tugasSaya:tugasSaya,cariHitung:cariHitung,'+
  'setView:function(v){view=v;},setPView:function(v){pView=v;},render:render,get kotor(){return _kotor||_menyimpan;}};\n' + ASLI.slice(iT);

const T0=Date.now()-86400000;
const tk=(id,name,o)=>Object.assign({id,name,daily:false,status:'To Do',progress:0,deadline:'2026-10-30',pics:['p1'],pic:'p1',div:'Business Development',
  project:'pr1',subtasks:[],dependsOn:[],updatedAt:T0,createdAt:T0},o||{});
let SRV={
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1',updatedAt:T0},
          {id:'p2',name:'Tegar Junindri',div:'Business Development',active:true,officeUserId:'u2',updatedAt:T0}],
  projects:[{id:'pr1',name:'Renovasi Bar',status:'Aktif',stage:'Execution',div:'Business Development',pics:['p1'],updatedAt:T0},
            {id:'pr2',name:'Menu Halloween',status:'Aktif',stage:'Execution',div:'Business Development',pics:['p2'],updatedAt:T0}],
  tasks:[
    tk('T1','Pasang ambalan bar',{subtasks:[{id:'s1',t:'Beli besi siku',done:false},{id:'s2',t:'Cat ulang rak',done:false}]}),
    tk('T2','Design menu Halloween',{project:'pr2',pics:['p2'],pic:'p2'}),
    tk('T3','Design kotak packaging',{project:'pr1'}),
    tk('T4','Design stiker lama',{project:'pr1',status:'Done',doneAt:'2026-10-01'})
  ],
  routines:[],coord:[],po:[{id:'o1',item:'Design banner PO',status:'Draft',updatedAt:T0}],agenda:[],pr:[]
};
const KOL=['people','projects','tasks','routines','coord','po','agenda','pr'];
function getAll(){ const o=JSON.parse(JSON.stringify(SRV)); o.focus={}; o.approverSets=[]; o.promos=[]; return o; }
function saveAll(b){ const st=b.data||{};
  KOL.forEach(k=>(st[k]||[]).forEach(r=>{ const i=SRV[k].findIndex(x=>x.id===r.id); if(i<0) SRV[k].push(r); else if((+r.updatedAt||0)>=(+SRV[k][i].updatedAt||0)) SRV[k][i]=r; }));
  return {saved:true,tsMs:Date.now()}; }
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://dev.laksamanamuda.id/bd/#mytask',
  beforeParse(w){
    w.localStorage.setItem('lm_session',JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch=async(url,opts)=>{ const u=String(url); let data;
      if(u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true},{id:'u2',name:'Tegar Junindri'}]};
      else if(u.indexOf('action=getAll')>-1) data={ok:true,data:getAll()};
      else if(opts&&opts.body){ const b=JSON.parse(opts.body); data=b.action==='saveAll'?{ok:true,data:saveAll(b)}:{ok:true,data:{}}; }
      else data={ok:true,data:{}};
      const t=JSON.stringify(data); return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)}; };
    w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
    w.Element.prototype.scrollIntoView=function(){};
  }});
const W=dom.window, D=W.document, tunggu=ms=>new Promise(r=>setTimeout(r,ms));
async function tenang(){ await tunggu(900); for(let i=0;i<60&&W.__uji.kotor;i++) await tunggu(50); await tunggu(400); }
const bersih=h=>h.replace(/<script[\s\S]*?<\/script>/g,'');

(async()=>{
  for(let i=0;i<100;i++){ try{ if(W.__uji&&W.__uji.DB.tasks.length) break; }catch(e){} await tunggu(50); }

  /* ---------- 1. assign sub-task ---------- */
  cek(!W.__uji.tugasSaya().some(t=>t.id==='T2'),'sebelum di-assign: T2 (milik Tegar) tidak ada di My Task Wandi');
  W.APP.taskModal('T1'); await tunggu(50);
  const sel=D.querySelectorAll('#m_subs select.subp');
  cek(sel.length===2,'tiap baris sub-task di modal punya pilihan assign');
  cek([...sel[0].options].some(o=>o.value==='p2'),'pilihan assign memuat kru (Tegar)');
  sel[0].value='p2'; sel[0].dispatchEvent(new W.Event('change'));
  W.APP.simpanTask('T1'); await tenang();
  const s1=SRV.tasks.find(t=>t.id==='T1').subtasks[0];
  cek(s1.p==='p2','assign sub-task tersimpan di server (p=p2)');
  cek(!SRV.tasks.find(t=>t.id==='T1').subtasks[1].p,'sub-task yang tidak di-assign tetap kosong (tidak ditebak)');

  // batal di modal tidak menyimpan
  W.APP.taskModal('T1'); await tunggu(50);
  const sel2=D.querySelectorAll('#m_subs select.subp');
  cek(sel2[0].value==='p2','modal yang dibuka lagi menampilkan assign yang tersimpan');
  sel2[1].value='p2'; sel2[1].dispatchEvent(new W.Event('change')); W.closeModal(); await tenang();
  cek(!SRV.tasks.find(t=>t.id==='T1').subtasks[1].p,'menutup modal tanpa Simpan tidak menyimpan assign');

  // Tegar sekarang punya T1 di My Task-nya (lewat sub-task)
  const t1=W.__uji.DB.tasks.find(t=>t.id==='T1');
  cek(W.__uji.DB.people.length===2,'roster dua kru');
  W.__uji.setView('mytask'); W.__uji.render(); await tunggu(50);
  const isiMy=bersih(D.body.innerHTML);
  cek(isiMy.indexOf('Pasang ambalan bar')>-1,'My Task Wandi tetap memuat T1 (PIC-nya)');
  // pohon sub-task menggambar avatar Tegar
  cek(/tr2 sub[\s\S]*?Beli besi siku[\s\S]*?TJ/.test(isiMy),'baris sub-task di My Task memajang avatar yang di-assign');

  /* ---------- 2. cari ---------- */
  const inp=D.getElementById('cari');
  cek(!!inp && !!D.getElementById('cariHasil'),'kotak cari punya wadah hasil');
  inp.value='design'; inp.dispatchEvent(new W.Event('input')); await tunggu(300);
  const box=D.getElementById('cariHasil');
  cek(box.classList.contains('show'),'mengetik menampilkan daftar hasil');
  const items=[...box.querySelectorAll('.ch-i')];
  cek(items.length===4,'"design" memunculkan 4 hasil (3 task + 1 PO), dapat '+items.length);
  cek(D.getElementById('modal').innerHTML==='','mengetik TIDAK langsung membuka task mana pun (bug lama)');
  cek(/Design stiker lama/.test(items[items.length-2].textContent)||/Design stiker lama/.test(box.textContent),'task yang Done tetap bisa ditemukan');
  const urut=items.map(b=>b.textContent);
  cek(urut.findIndex(x=>/stiker lama/.test(x)) > urut.findIndex(x=>/kotak packaging/.test(x)),'yang Done diurut di bawah yang masih jalan');
  cek(D.activeElement!==inp || D.getElementById('cari')===inp,'kotak cari tidak dibuat ulang saat hasil digambar');
  // cari sub-task
  inp.value='besi siku'; inp.dispatchEvent(new W.Event('input')); await tunggu(300);
  cek(/Pasang ambalan bar/.test(box.textContent)&&/sub-task: Beli besi siku/.test(box.textContent),'teks sub-task ikut dicari, dan sebabnya disebut');
  inp.value='tegar'; inp.dispatchEvent(new W.Event('input')); await tunggu(300);
  cek(/Pasang ambalan bar/.test(box.textContent),'nama yang di-assign sub-task ikut dicari');
  inp.value='zzzz'; inp.dispatchEvent(new W.Event('input')); await tunggu(300);
  cek(/Tidak ada task/.test(box.textContent),'tanpa hasil dikatakan');
  inp.value='kotak'; inp.dispatchEvent(new W.Event('input')); await tunggu(300);
  inp.focus(); inp.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await tunggu(50);
  cek(/Design kotak packaging/.test(D.getElementById('modal').innerHTML),'Enter membuka hasil yang disorot');
  cek(!box.classList.contains('show'),'daftar hasil ditutup sesudah memilih');
  W.closeModal();

  /* ---------- 3. Projects → Task ---------- */
  W.__uji.setView('projects'); W.APP.filterProj('scope','semua'); W.APP.filterProj('view','task'); await tunggu(50);
  let isi=bersih(D.body.innerHTML);
  cek(/>Task<\/button>/.test(isi),'Projects punya tombol tampilan Task');
  cek(/Pasang ambalan bar/.test(isi)&&/Design menu Halloween/.test(isi)&&/Design kotak packaging/.test(isi),'tampilan Task memuat task dari kedua project');
  cek(!/Design stiker lama/.test(D.getElementById('ptask').innerHTML),'bawaan Aktif: task Done tidak tampil');
  cek(/flabel[^>]*>[\s\S]{0,400}?Assign</.test(isi),'penyaringnya berlabel Assign');
  // saring assign Tegar: T2 (PIC) + T1 (lewat sub-task), bukan T3
  W.APP.togglePicFilter('p2'); await tunggu(50);
  const pt=D.getElementById('ptask').innerHTML;
  cek(/Design menu Halloween/.test(pt),'assign Tegar: task yang PIC-nya Tegar tampil');
  cek(/Pasang ambalan bar/.test(pt),'assign Tegar: task yang sub-task-nya di-assign ke Tegar ikut tampil');
  cek(!/Design kotak packaging/.test(pt),'assign Tegar: task Wandi yang tidak menyangkut Tegar tidak tampil');
  W.APP.togglePicFilter(''); await tunggu(50);
  // kotak cari di tampilan Task tidak kehilangan fokus
  const q1=D.getElementById('ptaskQ'); q1.focus(); q1.value='kotak'; q1.dispatchEvent(new W.Event('input')); await tunggu(20);
  cek(D.getElementById('ptaskQ')===q1,'mengetik di kotak cari tampilan Task tidak membuat ulang kotaknya');
  cek(/Design kotak packaging/.test(D.getElementById('ptask').innerHTML)&&!/Pasang ambalan bar/.test(D.getElementById('ptask').innerHTML),'kotak cari tampilan Task menyaring task');
  W.APP.pTaskCari(''); W.APP.pTaskArsip('arsip'); await tunggu(20);
  cek(/Design stiker lama/.test(D.getElementById('ptask').innerHTML)&&!/Design kotak packaging/.test(D.getElementById('ptask').innerHTML),'saklar Arsip menampilkan yang Done saja');
  selesai();
})().catch(e=>{ console.log('GAGAL uji tidak selesai: '+(e&&e.stack||e)); gagal++; selesai(); });
