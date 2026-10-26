/* uji-recurring-bd.js — Task Management: menu Recurring Task (26 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-recurring-bd.js
 *
 * Yang dijaga: menu ada; satu baris per SERI (kepala rantai ulangDari), Daily
 * maupun project; task tak berulang tidak ikut; Hentikan mencabut ulang +
 * menyimpan polanya, Done sesudahnya TIDAK melahirkan kejadian; Lanjutkan
 * memulihkan polanya. Yang diukur DATANYA.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(daftar){ for(const p of daftar){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
let ok=0, gagal=0;
function cek(s,p){ if(s){ok++;console.log('OK   '+p);} else {gagal++;console.log('GAGAL '+p);} }
function selesai(){ console.log('\n'+ok+' lulus, '+gagal+' gagal'); process.exit(gagal?1:0); }
if(!JSDOM_MOD){ console.log('LEWAT (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JSDOM_MOD;

const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) +
  '\nwindow.__uji={get DB(){return DB;},get view(){return view;},langkah:langkahUlang,berikut:deadlineBerikut};\n' + ASLI.slice(iTutup);

function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'},
          {id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Running',pics:['p1'],start:iso(-5),end:iso(20),health:'on-track',updatedAt:now}],
  tasks:[
    {id:'dA',name:'Cek stok bar',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'harian',deadline:iso(0),updatedAt:now},
    {id:'tP0',name:'Laporan vendor',div:'Business Development',pics:['p2'],status:'Done',doneAt:iso(-7),project:'pj1',ulang:'mingguan',deadline:iso(-7),updatedAt:now},
    {id:'tP1',name:'Laporan vendor',div:'Business Development',pics:['p2'],status:'To Do',project:'pj1',ulang:'mingguan',ulangDari:'tP0',deadline:iso(-1),updatedAt:now},
    {id:'dS',name:'Audit bulanan',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'',ulangBerhenti:{u:'bulanan',at:now,by:'X'},deadline:iso(5),updatedAt:now},
    {id:'dC',name:'Bersih gudang',div:'Business Development',pics:['p1'],status:'Doing',daily:true,deadline:iso(1),updatedAt:now}
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#recurring',
  beforeParse(w){
    w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch = async (url, opts)=>{
      const u=String(url); let data;
      if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true},{id:'u2',name:'Sari Lestari'}]};
      else if (u.indexOf('action=getAll')>-1) data={ok:true,data:JSON.parse(JSON.stringify(SEED))};
      else if (opts && opts.body){ const b=JSON.parse(opts.body); if(b.action==='saveAll') kiriman.push(b); data={ok:true,data:{saved:true,tsMs:Date.now()}}; }
      else data={ok:true,data:{}};
      const teks=JSON.stringify(data);
      return { ok:true, status:200, text:async()=>teks, json:async()=>JSON.parse(teks) };
    };
    w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
  }
});
const W = dom.window, D = W.document;
const tunggu = ms => new Promise(r=>setTimeout(r,ms));
const DB = () => W.__uji.DB;
const T = id => DB().tasks.find(t=>t.id===id);
const anak = id => DB().tasks.filter(t=>t.ulangDari===id);
const v = () => D.getElementById('view');

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(200);
  cek(D.getElementById('nav').innerHTML.indexOf("APP.go('recurring')")>-1, 'menu Recurring Task ada');
  cek(W.__uji.view==='recurring', 'alamat #recurring membuka Recurring Task');
  let isi=v().textContent;
  cek(/Cek stok bar/.test(isi), 'seri Daily ikut');
  cek((isi.match(/Laporan vendor/g)||[]).length===1, 'seri project ikut SEKALI (kepala rantai saja)');
  cek(!/Bersih gudang/.test(isi), 'task tak berulang tidak ikut');
  cek(!/Audit bulanan/.test(isi), 'seri dihentikan tidak di tab Aktif');
  const baris=[...v().querySelectorAll('tbody tr')].find(r=>/Laporan vendor/.test(r.textContent));
  cek(baris && /1×/.test(baris.textContent), 'jumlah kejadian selesai dihitung dari rantai');
  cek(/Grand Opening/.test(baris.textContent), 'tempat menyebut project');
  W.APP.setRecurring('henti'); isi=v().textContent;
  cek(/Audit bulanan/.test(isi) && /Setiap bulan/.test(isi), 'tab Dihentikan memuat seri + pola lamanya');
  W.APP.lanjutkanUlang('dS');
  cek(T('dS').ulang==='bulanan' && !T('dS').ulangBerhenti, 'Lanjutkan memulihkan pola');
  W.APP.setRecurring('aktif');
  W.APP.hentikanUlang('dA');
  cek(T('dA').ulang==='' && T('dA').ulangBerhenti && T('dA').ulangBerhenti.u==='harian', 'Hentikan mencabut ulang & menyimpan polanya');
  cek(!/Cek stok bar/.test(v().textContent), 'seri yang dihentikan pindah dari tab Aktif');
  W.APP.toggleTask ? W.APP.toggleTask('dA') : null;
  await tunggu(50);
  cek(anak('dA').length===0, 'Done sesudah dihentikan TIDAK melahirkan kejadian baru');
  await tunggu(1000);
  cek(kiriman.length>0, 'perubahan dikirim lewat saveAll');
  selesai();
})().catch(e=>{ console.log('GAGAL exception '+e.stack); gagal++; selesai(); });
