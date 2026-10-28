/* uji-review-bd.js — Task Management, tiga revisi (28 Oktober 2026).
 *
 *   JSDOM_PATH=… node tools/uji-review-bd.js
 *
 *  1. Kru NON-admin yang tidak punya anak buah melihat task & project orang
 *     lain (dulu cuma task-nya sendiri; admin modul melihat semuanya).
 *  2. Task punya "Review oleh" (reviewers [id kru]); task berstatus Review
 *     masuk My Task orang yang ditag, di kelompoknya sendiri, sekali saja.
 *  3. Ikon menu Daily Task berbeda dari Recurring Task.
 * Yang diukur DATANYA & DOM, bukan teks toast. Sesinya SENGAJA non-admin:
 * bug aslinya tidak pernah terlihat dari akun admin.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(d){ for(const p of d){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JM = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
let ok=0, gagal=0;
function cek(s,p,k){ if(s){ok++;console.log('OK   '+p);} else {gagal++;console.log('GAGAL '+p+(k?'  — '+k:''));} }
function selesai(){ console.log('\n'+ok+' lulus, '+gagal+' gagal'); process.exit(gagal?1:0); }
if(!JM){ console.log('LEWAT (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JM;

const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) +
  '\nwindow.__uji={get DB(){return DB;},ev:function(x){return eval(x);}};\n' + ASLI.slice(iTutup);

function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'},
          {id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Running',pics:['p1'],start:iso(-5),end:iso(20),health:'on-track',updatedAt:now}],
  tasks:[
    {id:'tW',name:'Task milik Wandi',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',deadline:iso(3),updatedAt:now},
    {id:'tR',name:'Proposal sponsor',div:'Business Development',pics:['p1'],status:'Review',reviewers:['p2'],project:'pj1',deadline:iso(-2),updatedAt:now},
    {id:'tD',name:'Cek stok harian',div:'Business Development',pics:['p1'],status:'To Do',daily:true,deadline:iso(0),updatedAt:now}
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
let SERVER = JSON.parse(JSON.stringify(SEED));
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#projects',
  beforeParse(w){
    // Sari: BUKAN admin modul, dan tidak punya anak buah.
    w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u2',name:'Sari Lestari',modules:['bd'],adminModules:[]}));
    w.fetch = async (url, opts)=>{
      const u=String(url); let data;
      if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata'},{id:'u2',name:'Sari Lestari'}]};
      else if (u.indexOf('action=getAll')>-1) data={ok:true,data:JSON.parse(JSON.stringify(SERVER))};
      else if (opts && opts.body){ const b=JSON.parse(opts.body); if(b.action==='saveAll'){ kiriman.push(b); SERVER=JSON.parse(JSON.stringify(b.data)); } data={ok:true,data:{saved:true,tsMs:Date.now()}}; }
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
const v = () => D.getElementById('view');
const buka = async nama => { W.location.hash='#'+nama; W.dispatchEvent(new W.HashChangeEvent('hashchange')); await tunggu(120); };

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(250);
  cek(W.__uji.ev('AKU && AKU.id')==='p2', 'yang login dikenali sebagai Sari (non-admin)');
  cek(W.__uji.ev('adminModul()')===false, 'Sari bukan admin modul');

  console.log('\n== 1. kru non-admin melihat task & project orang lain ==');
  cek(W.__uji.ev('tasksTerlihat().length')===3, 'tasksTerlihat memuat seluruh task', W.__uji.ev('tasksTerlihat().length'));
  cek(W.__uji.ev('projectsTerlihat().length')===1, 'projectsTerlihat memuat project Wandi');
  await buka('projects');
  cek(/Grand Opening/.test(v().innerHTML), 'halaman Projects menampilkan project milik orang lain');
  await buka('daily');
  cek(/Cek stok harian/.test(v().innerHTML), 'Daily Task menampilkan task harian milik orang lain');
  cek(W.__uji.ev('pScope')==='semua' && W.__uji.ev('fScope')==='semua' && W.__uji.ev('bScope')==='semua',
      'penyaring Lingkup bawaannya Semua');
  W.APP.filterProj('scope','tim'); W.APP.filterProj('reset');
  cek(W.__uji.ev('pScope')==='semua', 'Reset mengembalikan Lingkup ke Semua, bukan Tim saya');
  W.APP.filterProj('scope','saya');
  await tunggu(30);
  cek(!/Grand Opening/.test(v().innerHTML), 'Lingkup "Ditugaskan ke saya" tetap menyaring (alat fokus masih jalan)');
  W.APP.filterProj('reset');

  console.log('\n== 2. Review oleh ==');
  cek(W.__uji.ev("menungguReviewSaya(DB.tasks.find(t=>t.id==='tR'))")===true, 'task berstatus Review yang men-tag Sari = menunggu review Sari');
  await buka('mytask');
  const isi = v().innerHTML;
  cek(/Menunggu review kamu/.test(isi), 'My Task Sari punya kelompok "Menunggu review kamu"');
  cek((isi.match(/Proposal sponsor/g)||[]).length===1, 'task review muncul SEKALI (tidak dobel di kelompok Lewat deadline)', String((isi.match(/Proposal sponsor/g)||[]).length));
  cek(/👁 Review: Sari/.test(isi), 'tanda Review: Sari tampil di barisnya');
  cek(!/Task milik Wandi/.test(isi), 'task Wandi yang tidak men-tag Sari tidak masuk My Task Sari');

  W.APP.taskModal('tW');
  await tunggu(30);
  const chipRev = [...D.querySelectorAll('#m_rev .picchip')];
  cek(chipRev.length===2, 'modal task punya pemilih "Review oleh" berisi kru');
  cek(/Review oleh/.test(D.body.innerHTML), 'label Review oleh tampil');
  chipRev.find(b=>b.getAttribute('data-id')==='p2').click();
  const nKirim=kiriman.length;
  W.APP.simpanTask('tW');
  await tunggu(1300);   // save() modul ini ditunda 800 ms
  cek(JSON.stringify(T('tW').reviewers)==='["p2"]', 'reviewer tersimpan di task', JSON.stringify(T('tW').reviewers));
  const k = kiriman.slice(nKirim).pop();
  const kt = k && (k.data.tasks||[]).find(t=>t.id==='tW');
  cek(kt && JSON.stringify(kt.reviewers)==='["p2"]', 'reviewer ikut terkirim ke server (saveAll)');
  cek(JSON.stringify(T('tW').pics)==='["p1"]', 'PIC tidak berubah karena reviewer ditag');
  // Reviewer bukan pelaksana: belum berstatus Review -> belum masuk My Task Sari.
  await buka('mytask');
  cek(!/Task milik Wandi/.test(v().innerHTML), 'task yang belum berstatus Review belum masuk My Task reviewer');
  // Melepas tag
  W.APP.taskModal('tW'); await tunggu(30);
  [...D.querySelectorAll('#m_rev .picchip')].find(b=>b.getAttribute('data-id')==='p2').click();
  W.APP.simpanTask('tW'); await tunggu(300);
  cek(JSON.stringify(T('tW').reviewers)==='[]', 'tag reviewer bisa dilepas lagi');

  console.log('\n== 3. ikon Daily vs Recurring ==');
  const svgMenu = id => { const a=D.querySelector('[data-v="'+id+'"],[data-view="'+id+'"],[onclick*="\''+id+'\'"]'); const s=a&&a.querySelector('svg'); return s?s.innerHTML:null; };
  const iDaily=svgMenu('daily'), iRec=svgMenu('recurring');
  cek(!!iDaily && !!iRec, 'kedua menu punya ikon', String(!!iDaily)+'/'+String(!!iRec));
  cek(iDaily && iRec && iDaily!==iRec, 'ikon Daily Task BERBEDA dari Recurring Task');
  selesai();
})().catch(e=>{ gagal++; console.log('GAGAL melempar: '+e.message); selesai(); });
