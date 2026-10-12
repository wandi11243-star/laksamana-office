/* uji-daily-bd.js — Task Management: Daily Task & task berulang (12 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-daily-bd.js
 *
 * Yang dijaga:
 *  - menu Daily Task ada, berisi HANYA task ber-daily (List/Kanban/Timeline);
 *  - task berulang yang ditandai Done melahirkan SATU kejadian berikutnya,
 *    lewat ketiga jalan ke Done (centang, modal, seret kartu);
 *  - Done → buka lagi → Done lagi TIDAK melahirkan kembaran;
 *  - yang telat dilompati ke tanggal yang tidak lagi lampau;
 *  - hari kerja melompati Sabtu/Minggu, bulanan menjepit tanggal 31;
 *  - berulang tanpa deadline DITOLAK, daily tidak boleh sekaligus ber-project.
 * Yang diukur DATANYA, bukan teks toast.
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
    {id:'dA',name:'Cek stok bar',div:'Business Development',pics:['p1','p2'],status:'To Do',daily:true,ulang:'harian',deadline:iso(0),
      subtasks:[{id:'s1',t:'Hitung botol',done:true,d:iso(0)}],updatedAt:now},
    {id:'dB',name:'Rekap kas mingguan',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'mingguan',deadline:iso(-10),updatedAt:now},
    {id:'dC',name:'Bersih gudang',div:'Business Development',pics:['p1'],status:'Doing',daily:true,deadline:iso(1),updatedAt:now},
    {id:'tP',name:'Task project biasa',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',deadline:iso(3),updatedAt:now}
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#daily',
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

  // --- menu & halaman ---
  cek(/APP\.go\('daily'\)/.test(D.getElementById('nav').innerHTML), 'menu Daily Task ada');
  cek(W.__uji.view==='daily', 'alamat #daily membuka Daily Task');
  let isi=v().textContent;
  cek(/Cek stok bar/.test(isi) && /Bersih gudang/.test(isi), 'Daily Task memuat task ber-daily');
  cek(!/Task project biasa/.test(isi), 'task project TIDAK ikut di Daily Task');
  cek(/Setiap hari/.test(isi) && /Setiap minggu/.test(isi), 'task berulang ditandai jenis ulangnya');
  W.APP.setDaily('mode','kanban');
  cek(v().querySelectorAll('.board .kcol').length===4, 'Daily Task bisa dilihat sebagai Kanban');
  cek(!/Task project biasa/.test(v().querySelector('.board').textContent), 'Kanban Daily hanya task daily');
  W.APP.setDaily('mode','timeline');
  const g=v().querySelector('#gantt');
  cek(!!g && [...g.querySelectorAll('.g-lab')].some(e=>/Bersih gudang/.test(e.textContent)), 'Daily Task bisa dilihat sebagai Timeline');
  cek(!!g && ![...g.querySelectorAll('.g-lab')].some(e=>/Task project biasa/.test(e.textContent)), 'Timeline Daily hanya task daily');
  W.APP.setDaily('mode','list');

  // --- kartu baru dari Kanban Daily jadi daily, tanpa project ---
  W.APP.setDaily('mode','kanban');
  const inp=v().querySelector('[data-kadd="To Do"]'); inp.value='Kartu harian baru';
  W.APP.boardTambah(inp,'To Do','__daily__');
  const kb=DB().tasks.find(t=>t.name==='Kartu harian baru');
  cek(!!kb && kb.daily===true && !kb.project, 'kartu dari Kanban Daily lahir sebagai Daily Task tanpa project');
  W.APP.setDaily('mode','list');

  // --- centang: berulang harian melahirkan kejadian berikutnya ---
  W.APP.toggleTask('dA');
  let a=anak('dA');
  cek(a.length===1, 'Done pada task harian melahirkan satu kejadian berikutnya');
  cek(a[0] && a[0].deadline===iso(1) && a[0].status==='To Do' && a[0].daily && a[0].ulang==='harian', 'kejadian berikutnya: deadline besok, To Do, tetap daily & berulang');
  cek(a[0] && a[0].pics.length===2, 'PIC ikut disalin');
  cek(a[0] && a[0].subtasks.length===1 && !a[0].subtasks[0].done && a[0].subtasks[0].d===iso(1), 'sub-task disalin belum dicentang, deadline-nya ikut bergeser');
  cek(T('dA').status==='Done', 'yang lama tetap Done (riwayat utuh)');
  W.APP.toggleTask('dA'); W.APP.toggleTask('dA');
  cek(anak('dA').length===1, 'Done → buka lagi → Done tidak melahirkan kembaran');

  // --- telat dilompati ---
  W.APP.toggleTask('dB');
  const b=anak('dB')[0];
  cek(!!b && b.deadline>=iso(0) && b.deadline<=iso(6), 'task mingguan yang telat 10 hari: berikutnya tidak di masa lalu (dalam 7 hari ke depan)');

  // --- tidak berulang: tidak melahirkan apa pun ---
  const n0=DB().tasks.length;
  W.APP.toggleTask('dC');
  cek(DB().tasks.length===n0, 'task tanpa ulang tidak melahirkan task baru');

  // --- seret kartu ke Done ---
  const nx=a[0];
  W.APP.setDaily('mode','kanban');
  W.APP.dragBoard({dataTransfer:{setData(){} ,effectAllowed:''},target:{classList:{add(){}}}},nx.id);
  W.APP.dropBoard({preventDefault(){}},'Done');
  cek(anak(nx.id).length===1 && anak(nx.id)[0].deadline===iso(2), 'seret ke Done juga melahirkan kejadian berikutnya');
  W.APP.setDaily('mode','list');

  // --- modal: berulang tanpa deadline ditolak; daily melepas project ---
  W.APP.taskModal(null,'__daily__');
  cek(D.getElementById('tg_daily').classList.contains('on'), 'task baru dari Daily Task otomatis bertanda Daily');
  D.getElementById('m_name').value='Tanpa deadline';
  D.getElementById('m_due').value='';
  D.getElementById('m_ulang').value='harian';
  const n1=DB().tasks.length;
  W.APP.simpanTask('');
  cek(DB().tasks.length===n1 && !!D.getElementById('m_name'), 'berulang tanpa deadline ditolak, modal tetap terbuka');
  D.getElementById('m_due').value=iso(0);
  D.getElementById('m_proj').value='pj1';
  W.APP.simpanTask('');
  const baru=DB().tasks.find(t=>t.name==='Tanpa deadline');
  cek(!!baru && baru.daily && !baru.project && baru.ulang==='harian', 'tersimpan sebagai daily berulang, project dilepas');
  W.APP.taskModal(baru.id);
  D.getElementById('m_status').value='Done';
  W.APP.simpanTask(baru.id);
  cek(anak(baru.id).length===1, 'Done lewat modal juga melahirkan kejadian berikutnya');

  // --- aritmetika ---
  const L=W.__uji.langkah;
  cek(L('2026-10-09','kerja')==='2026-10-12', 'hari kerja: Jumat → Senin');
  cek(L('2026-01-31','bulanan')==='2026-02-28', 'bulanan: 31 Jan → 28 Feb (dijepit)');
  cek(L('2026-10-12','mingguan')==='2026-10-19', 'mingguan: +7 hari');

  await tunggu(1300);
  cek(kiriman.some(k=>JSON.stringify(k).indexOf('ulangDari')>-1), 'kejadian berikutnya terkirim lewat saveAll');
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+e.stack); gagal++; selesai(); });
