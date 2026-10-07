/* uji-timeline-bd.js — Task Management: Timeline (Gantt), My Task, kartu
 * project, dan detail project bertab (7 Oktober 2026, bentuk "Armada").
 *
 *   JSDOM_PATH=… node tools/uji-timeline-bd.js
 *
 * Yang dijaga:
 *  - menu Board & Tasks dicabut, alamat lama #board/#tasks DIALIHKAN;
 *  - My Task hanya memuat task yang PIC-nya aku;
 *  - Timeline: task ber-start+deadline jadi batang, tanpa start jadi belah
 *    ketupat, sub-task ber-deadline ikut, panah urutan digambar;
 *  - mulai sesudah deadline DITOLAK (data tidak berubah);
 *  - deadline sub-task tersimpan lewat modal.
 * Yang diukur DATANYA & DOM, bukan teks toast.
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
const html = ASLI.slice(0,iTutup) + '\nwindow.__uji={get DB(){return DB;},get view(){return view;}};\n' + ASLI.slice(iTutup);

/* Tanggal RELATIF terhadap hari ini — fixture berjam mati membusuk sendiri. */
function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'},
          {id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'}],
  projects:[
    {id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Running',pics:['p1'],start:iso(-5),end:iso(20),health:'on-track',updatedAt:now},
    {id:'pj2',name:'Project Telat',div:'Business Development',type:'Internal',stage:'Running',pics:['p2'],start:iso(-30),end:iso(-2),health:'on-track',updatedAt:now},
    {id:'pj3',name:'Project Beres',div:'Business Development',type:'Internal',stage:'Completed',pics:['p1'],start:iso(-60),end:iso(-40),updatedAt:now}
  ],
  tasks:[
    {id:'tA',name:'Booking venue',div:'Business Development',pics:['p1'],status:'Doing',project:'pj1',start:iso(-3),deadline:iso(4),updatedAt:now},
    {id:'tB',name:'Sebar undangan',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',start:iso(5),deadline:iso(9),dependsOn:['tA'],
      subtasks:[{id:'s1',t:'Desain undangan',done:false,d:iso(6)},{id:'s2',t:'Cetak',done:false}],updatedAt:now},
    {id:'tC',name:'Titik deadline saja',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',deadline:iso(12),updatedAt:now},
    {id:'tD',name:'Punya Sari',div:'Business Development',pics:['p2'],status:'To Do',project:'pj2',deadline:iso(1),updatedAt:now},
    {id:'tE',name:'Telat punyaku',div:'Business Development',pics:['p1'],status:'To Do',project:null,deadline:iso(-3),updatedAt:now}
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#board',
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
const T = id => W.__uji.DB.tasks.find(t=>t.id===id);
const v = () => D.getElementById('view');

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(200);

  // --- menu & alamat lama ---
  const nav = D.getElementById('nav').innerHTML;
  cek(!/APP\.go\('board'\)/.test(nav) && !/APP\.go\('tasks'\)/.test(nav), 'menu Board & Tasks dicabut');
  cek(/APP\.go\('mytask'\)/.test(nav), 'menu My Task ada');
  cek(/APP\.go\('timeline'\)/.test(nav), 'menu Timeline ada');
  cek(W.__uji.view==='projects', 'alamat lama #board dialihkan ke Projects, bukan memantul ke Dashboard');
  W.location.hash='#tasks'; await tunggu(80);
  cek(W.__uji.view==='mytask', 'alamat lama #tasks dialihkan ke My Task');

  // --- My Task ---
  W.APP.go('mytask');
  const isi = v().textContent;
  cek(/Booking venue/.test(isi) && /Telat punyaku/.test(isi), 'My Task memuat task milikku');
  cek(!/Punya Sari/.test(isi), 'My Task TIDAK memuat task orang lain');
  const grpTelat = [...v().querySelectorAll('.sect')].find(e=>/Lewat deadline/.test(e.textContent));
  cek(!!grpTelat && /\(1\)/.test(grpTelat.textContent), 'task lewat deadline dikelompokkan sendiri');
  cek(/Menunggu task lain/.test(isi), 'task yang masih menunggu prasyarat dikelompokkan sendiri');
  cek(!!v().querySelector('.pgrid .pcard'), 'project yang kupegang tampil sebagai kartu');
  const badge = D.querySelector('#nav .badge');
  cek(!!badge && badge.textContent==='1', 'badge menu My Task = jumlah task milikku yang telat');
  W.APP.setMy('mode','kanban');
  cek(v().querySelectorAll('.board .kcol').length===4, 'My Task bisa dilihat sebagai Kanban 4 kolom');
  cek(!/Punya Sari/.test(v().querySelector('.board').textContent), 'Kanban My Task juga hanya milikku');
  W.APP.setMy('mode','list');

  // --- Projects: kartu ---
  W.APP.go('projects');
  const kartu = [...v().querySelectorAll('.pcard h3')].map(e=>e.textContent);
  cek(kartu.length===2 && kartu.indexOf('Project Beres')<0, 'Projects bawaan berbentuk kartu, hanya yang aktif');
  cek(kartu[0]==='Project Telat', 'kartu diurut dari yang paling butuh perhatian (lewat deadline di atas)');
  const kTelat = [...v().querySelectorAll('.pcard')].find(e=>/Project Telat/.test(e.textContent));
  cek(/Lewat deadline/.test(kTelat.textContent), 'kartu project lewat deadline ditandai');
  W.APP.filterProj('st','semua');
  cek(v().querySelectorAll('.pcard').length===3, 'status Semua memuat project yang sudah selesai');
  W.APP.filterProj('view','kanban');
  cek(v().querySelectorAll('.kanban .kcol').length===5 && !v().querySelector('.pcard'), 'tampilan Kanban stage tetap ada');
  W.APP.filterProj('view','kartu'); W.APP.filterProj('st','aktif');

  // --- detail project ---
  W.APP.bukaProject('pj1');
  cek(v().querySelectorAll('.board .kcol').length===4, 'detail project bawaannya tetap Kanban');
  cek(!!v().querySelector('.meta-grid') && /Waktu terpakai/.test(v().textContent), 'kepala project memuat meta (PIC, mulai, deadline, progress, waktu terpakai)');
  W.APP.setPd('mode','list');
  cek(v().querySelectorAll('.tr2.sub').length===2, 'tab Task & sub-task menggambar sub-task di bawah task-nya');
  W.APP.setPd('mode','timeline');
  const g = v().querySelector('#gantt');
  cek(!!g, 'tab Timeline menggambar Gantt');
  const lab = [...g.querySelectorAll('.g-lab')].map(e=>e.textContent);
  cek(lab.some(x=>/Booking venue/.test(x)) && lab.some(x=>/Desain undangan/.test(x)), 'Gantt project memuat task & sub-task');
  cek(g.querySelectorAll('.g-bar').length===2, 'task ber-start+deadline digambar sebagai batang');
  cek(g.querySelectorAll('.g-dia:not(.sm)').length===1, 'task tanpa start digambar sebagai belah ketupat di deadline');
  cek(g.querySelectorAll('.g-dia.sm').length===1, 'sub-task ber-deadline ikut digambar; yang tanpa deadline tidak');
  cek(g.querySelectorAll('.g-arrows > path').length===1, 'panah urutan dari prasyarat ke task yang menunggu');
  cek(!!g.querySelector('.g-bar.lock'), 'task yang masih menunggu diwarnai terkunci');
  W.APP.tx('tB');
  cek(![...v().querySelectorAll('#gantt .g-lab')].some(e=>/Desain undangan/.test(e.textContent)), 'sub-task bisa ditutup di Gantt');
  W.APP.tx('tB');
  W.APP.gZoom('day');
  cek(!!v().querySelector('#gantt .g-scale .dy.td'), 'zoom Hari menandai hari ini di skala');
  W.APP.gZoom('week');

  // --- Timeline semua project ---
  W.APP.go('timeline');
  let rowsP = v().querySelectorAll('#gantt .g-row.proj');
  cek(rowsP.length===2, 'Timeline: satu baris per project aktif');
  cek(v().querySelectorAll('#gantt .g-row:not(.proj)').length===0, 'Timeline: project tertutup secara bawaan');
  W.APP.gx('pj1');
  cek(v().querySelectorAll('#gantt .g-row:not(.proj)').length===5, 'membuka project memunculkan task + sub-task-nya');
  W.APP.gAll(0);
  cek(v().querySelectorAll('#gantt .g-row:not(.proj)').length===0, 'Tutup semua');
  W.APP.filterTl('st','semua');
  cek(v().querySelectorAll('#gantt .g-row.proj').length===3, 'Timeline status Semua memuat project selesai');
  W.APP.filterTl('st','aktif');

  // --- modal: mulai & deadline sub-task ---
  W.APP.taskModal('tC');
  D.getElementById('m_start').value=iso(20);   // sesudah deadline (iso 12)
  const nKirim = kiriman.length;
  W.APP.simpanTask('tC');
  cek(!T('tC').start && !!D.getElementById('m_name'), 'mulai sesudah deadline ditolak: data tidak berubah, modal tetap terbuka');
  D.getElementById('m_start').value=iso(8);
  W.APP.simpanTask('tC');
  cek(T('tC').start===iso(8), 'tanggal mulai tersimpan');
  await tunggu(1300);
  cek(kiriman.length>nKirim, 'perubahan terkirim lewat saveAll');
  W.APP.taskModal('tB');
  const d2 = D.querySelectorAll('#m_subs .subd')[1];
  cek(!!d2 && d2.value==='', 'kotak deadline sub-task tergambar, kosong untuk yang belum punya');
  d2.value=iso(7); d2.dispatchEvent(new W.Event('change',{bubbles:true}));
  W.APP.simpanTask('tB');
  cek(T('tB').subtasks[1].d===iso(7) && T('tB').subtasks[0].d===iso(6), 'deadline sub-task tersimpan, yang lama tetap');

  // --- halaman lain tetap tergambar ---
  for (const h of ['dashboard','mytask','projects','timeline','calendar','promo','purchasing','tim']) {
    let e=null; try{ W.APP.go(h); }catch(x){ e=x; }
    cek(!e && v().innerHTML.length>50, 'halaman '+h+' tergambar'+(e?' — '+e.message:''));
  }
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+e.stack); gagal++; selesai(); });
