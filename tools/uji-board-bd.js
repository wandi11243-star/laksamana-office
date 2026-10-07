/* uji-board-bd.js — Task Management (eks BD OS): Board ala Trello, sub-task,
 * dan urutan/dependensi antar task (6 Oktober 2026).
 *
 *   JSDOM_PATH=… node tools/uji-board-bd.js
 *
 * Yang dijaga:
 *  - menu Koordinasi & Routine dicabut, DATANYA tetap ikut tiap saveAll
 *    (dicabut dari KOLEKSI, server mengosongkan tabelnya);
 *  - task yang menunggu task lain TIDAK BISA Done lewat jalan mana pun —
 *    centang, Simpan di modal, maupun seret kartu ke kolom Done;
 *  - lingkaran urutan tidak bisa dibuat dari modal;
 *  - sub-task tersimpan dan progress dihitung darinya.
 * Yang diukur DATANYA (DB & isi kiriman), bukan teks toast.
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
  '\nwindow.__uji={get DB(){return DB;},kirim:kirim,setKotor:function(){_kotor=true;},'+
  'get bProj(){return bProj;}};\n' + ASLI.slice(iTutup);

const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Execution',pics:['p1'],updatedAt:now}],
  tasks:[
    {id:'tA',name:'Booking venue',div:'Business Development',pics:['p1'],status:'Doing',project:'pj1',deadline:'2026-10-10',updatedAt:now},
    {id:'tB',name:'Sebar undangan',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',deadline:'2026-10-12',dependsOn:['tA'],updatedAt:now},
    {id:'tC',name:'Task lepas',div:'Business Development',pics:['p1'],status:'Backlog',project:null,updatedAt:now}
  ],
  routines:[{id:'r1',name:'Rekap mingguan',active:true,updatedAt:now}],
  coord:[{id:'c1',title:'Minta desain',status:'Pending',updatedAt:now}],
  po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/',
  beforeParse(w){
    w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch = async (url, opts)=>{
      const u=String(url); let data;
      if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true}]};
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
const dropKe = st => { W.APP.dragBoard({dataTransfer:{setData(){}},target:{classList:{add(){}}}}, W.__drag); W.APP.dropBoard({preventDefault(){}}, st); };

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(200);

  // --- nama & menu ---
  cek(D.title.indexOf('BD OS')<0 && D.title.indexOf('Task Management')>-1, 'judul halaman bukan lagi BD OS');
  const nav = D.getElementById('nav').innerHTML;
  cek(!/APP\.go\('board'\)/.test(nav) && !/APP\.go\('tasks'\)/.test(nav), 'menu Board & Tasks dicabut (7 Okt 2026)');
  cek(/APP\.go\('mytask'\)/.test(nav) && /APP\.go\('timeline'\)/.test(nav), 'menu My Task & Timeline ada');
  cek(!/APP\.go\('coord'\)/.test(nav) && !/APP\.go\('routine'\)/.test(nav), 'menu Koordinasi & Routine dicabut');

  // --- board ---
  W.APP.go('board');
  const v = () => D.getElementById('view');
  const kol = () => [...v().querySelectorAll('.board .kcol')];
  cek(kol().map(k=>k.querySelector('.kt').textContent).join('|')==='To Do|Doing|Review|Done', 'board cuma 4 kolom: To Do, Doing, Review, Done');
  cek(T('tC').status==='To Do', 'status lama Backlog dipetakan ke To Do');
  const isiKol = st => { const k=kol().find(c=>c.querySelector('.kt').textContent===st); return k?k.querySelector('.kcol-b').textContent:''; };
  cek(isiKol('Doing').indexOf('Booking venue')>-1 && isiKol('To Do').indexOf('Sebar undangan')>-1, 'kartu berdiri di kolom statusnya');
  cek(/Menunggu: Booking venue/.test(isiKol('To Do')), 'kartu yang menunggu menyebut prasyaratnya');

  // --- tidak bisa Done sebelum prasyarat ---
  W.APP.toggleTask('tB');
  cek(T('tB').status!=='Done', 'centang Done DITOLAK selama prasyarat belum Done');
  W.__drag='tB'; dropKe('Done');
  cek(T('tB').status!=='Done', 'seret ke kolom Done DITOLAK selama prasyarat belum Done');
  W.APP.taskModal('tB');
  D.getElementById('m_status').value='Done';
  W.APP.simpanTask('tB');
  cek(T('tB').status!=='Done', 'Simpan Done di modal DITOLAK selama prasyarat belum Done');
  cek(!!D.getElementById('m_name'), 'modal tetap terbuka sesudah ditolak');
  W.closeModal();

  // --- lingkaran ditolak ---
  W.APP.taskModal('tA');
  cek(D.getElementById('m_deps').textContent.indexOf('Sebar undangan')<0, 'modal A tidak menawarkan B (B menunggu A — lingkaran)');
  W.closeModal();
  W.APP.taskModal('tB');
  cek(D.getElementById('m_deps').textContent.indexOf('Booking venue')>-1, 'modal B menampilkan prasyaratnya');
  cek(D.getElementById('m_deps').textContent.indexOf('Task lepas')<0, 'task di luar project tidak ditawarkan');

  // --- sub-task ---
  const inp = D.getElementById('m_subBaru');
  inp.value='Desain undangan'; W.APP.subTambah();
  inp.value='Cetak'; W.APP.subTambah();
  inp.value='   '; W.APP.subTambah();
  cek(D.querySelectorAll('#m_subs .subrow').length===2, 'dua sub-task tergambar, yang kosong ditolak');
  cek(D.activeElement===D.getElementById('m_subBaru'), 'fokus kembali ke kotak sub-task baru');
  W.APP.subCentang(0,true);
  W.APP.simpanTask('tB');
  cek((T('tB').subtasks||[]).length===2 && T('tB').subtasks[0].done===true, 'sub-task tersimpan berikut centangnya');
  cek(T('tB').progress===50, 'progress dihitung dari sub-task (1/2 = 50%)');
  cek(T('tB').dependsOn.indexOf('tA')>-1, 'prasyarat tetap tersimpan sesudah disunting');
  cek(/☑ 1\/2/.test(isiKol('To Do')), 'kartu menampilkan hitungan sub-task');

  // Batal tidak boleh menyimpan sub-task
  W.APP.taskModal('tB'); D.getElementById('m_subBaru').value='Jangan disimpan'; W.APP.subTambah(); W.closeModal();
  cek(T('tB').subtasks.length===2, 'menekan Batal tidak menyimpan sub-task baru');

  // --- sesudah prasyarat Done ---
  W.__drag='tA'; dropKe('Done');
  cek(T('tA').status==='Done' && T('tA').progress===100, 'task tanpa prasyarat bisa diseret ke Done');
  cek(!!T('tA').doneAt, 'Done mencatat tanggal selesainya (waktu berhenti)');
  W.APP.filterBoard('arsip','semua');
  const kartuA=[...v().querySelectorAll('.kcard')].find(k=>/Booking venue/.test(k.textContent));
  cek(!!kartuA && !!kartuA.querySelector('.tag.ok') && !kartuA.querySelector('.tag.overdue'), 'deadline task Done digambar hijau, bukan lewat/hitung mundur');
  W.APP.filterBoard('arsip','aktif');
  W.__drag='tA'; dropKe('Doing');
  cek(!T('tA').doneAt, 'dibuka lagi dari Done -> tanggal selesainya dibuang');
  W.__drag='tA'; dropKe('Done');
  W.__drag='tB'; dropKe('Done');
  cek(T('tB').status==='Done', 'sesudah prasyarat Done, task yang menunggu bisa Done');

  // --- tambah kartu cepat ---
  W.APP.bukaBoard('pj1');
  const kadd = v().querySelector('[data-kadd="Review"]');
  kadd.value='Cek sound system'; kadd.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  const baru = W.__uji.DB.tasks.find(t=>t.name==='Cek sound system');
  cek(!!baru && baru.status==='Review' && baru.project==='pj1', 'kartu cepat lahir di kolom & project yang dipilih');
  cek(D.activeElement===v().querySelector('[data-kadd="Review"]'), 'fokus kembali ke kotak tambah kolom yang sama');
  cek(!v().querySelector('[data-kadd="Done"]'), 'kolom Done tidak punya kotak tambah');

  // --- hapus melepas urutan ---
  W.__uji.DB.tasks.push({id:'tD',name:'Prasyarat lain',status:'To Do',project:'pj1',pics:['p1']});
  T('tB').dependsOn=['tA','tD'];
  W.APP.hapusTask('tD');
  cek(T('tB').dependsOn.indexOf('tD')<0, 'menghapus task ikut melepasnya dari yang menunggu');

  // --- data Koordinasi & Routine tetap dikirim ---
  W.__uji.setKotor(); await W.__uji.kirim();
  const k = kiriman[kiriman.length-1];
  cek(k && (k.data.coord||[]).some(c=>c.id==='c1') && (k.data.routines||[]).some(r=>r.id==='r1'),
      'data Koordinasi & Routine tetap ikut saveAll (tidak terhapus di server)');

  // --- revisi 6 Okt (putaran 2) ---
  // checkbox sub-task di modal tidak boleh ikut width:100% dari .field input
  W.APP.taskModal('tB');
  const cb = D.querySelector('#m_subs .subrow input[type=checkbox]');
  const gaya = W.getComputedStyle(cb);
  cb && cek(gaya.width==='16px', 'checkbox sub-task di modal selebar 16px (bukan 100%) — '+gaya.width);
  const teks = D.querySelector('#m_subs .subrow .subt');
  cek(!!teks && teks.value==='Desain undangan', 'teks sub-task terbaca di kotaknya');
  W.closeModal();

  // urutan deadline + arsip di detail project
  W.__uji.DB.tasks.push({id:'tE',name:'Paling awal',status:'To Do',project:'pj1',deadline:'2026-10-01',pics:['p1']});
  W.__uji.DB.tasks.push({id:'tF',name:'Tanpa deadline',status:'To Do',project:'pj1',deadline:'',pics:['p1']});
  W.APP.bukaProject('pj1');
  cek(v().querySelectorAll('.board .kcol').length===4, 'membuka project langsung tampil papan Kanban');
  W.APP.setPd('mode','list');
  const nama = () => [...v().querySelectorAll('.tr2:not(.sub) .t-name')].map(e=>e.textContent);
  let n = nama();
  cek(n[0]==='Paling awal' && n[n.length-1]==='Tanpa deadline', 'daftar task project diurut deadline terdekat, tanpa deadline paling bawah');
  cek(n.indexOf('Booking venue')<0 && n.indexOf('Sebar undangan')<0, 'mode Aktif menyembunyikan task Done (arsip)');
  W.APP.setPd('arsip','arsip'); n=nama();
  cek(n.indexOf('Booking venue')>-1 && n.indexOf('Paling awal')<0, 'mode Arsip hanya task Done');
  W.APP.setPd('arsip','semua'); n=nama();
  cek(n.indexOf('Booking venue')>-1 && n.indexOf('Paling awal')>-1, 'mode Semua memuat keduanya');
  W.APP.setPd('arsip','aktif');

  // dropdown sub-task langsung dari baris
  W.APP.setPd('arsip','semua');
  const subBaris = () => v().querySelectorAll('.tr2.sub input[type=checkbox]');
  cek(subBaris().length===2, 'sub-task tergambar di bawah task-nya (pohon), terbuka secara bawaan');
  const tog = v().querySelector('.tr2 .caret');
  cek(!!tog, 'baris task punya tombol buka/tutup sub-task');
  tog.click();
  cek(subBaris().length===0, 'menekan tombolnya menutup sub-task');
  cek(!D.getElementById('m_name'), 'buka/tutup sub-task tidak ikut membuka modal edit');
  v().querySelector('.tr2 .caret').click();
  const sebelum = T('tB').subtasks.filter(x=>x.done).length;
  const idx = T('tB').subtasks.findIndex(x=>!x.done);
  subBaris()[idx].click();
  cek(T('tB').subtasks.filter(x=>x.done).length===sebelum+1, 'centang di dropdown langsung menyimpan sub-task');
  W.APP.setPd('arsip','aktif');

  // kanban di detail project
  W.APP.setPd('mode','kanban');
  cek(v().querySelectorAll('.board .kcol').length===4, 'detail project bisa kembali ke Kanban');
  cek(!!v().querySelector('.karsip'), 'kolom Done di mode Aktif diringkas jadi arsip, tetap jadi tempat jatuh');
  const ka = v().querySelector('[data-kadd="To Do"]');
  ka.value='Dari kanban project'; ka.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  const kk = W.__uji.DB.tasks.find(t=>t.name==='Dari kanban project');
  cek(!!kk && kk.project==='pj1', 'kartu dari kanban project masuk ke project itu');
  W.APP.setPd('mode','list');

  // kanban project: arsip
  W.APP.bukaBoard('pj1');
  cek(!/Booking venue/.test(v().querySelector('.board').textContent), 'Kanban mode Aktif tidak menggambar kartu Done');
  W.APP.setPd('arsip','semua');
  cek(/Booking venue/.test(v().querySelector('.board').textContent), 'Kanban mode Semua menggambar kartu Done');
  W.APP.setPd('arsip','aktif');

  // --- halaman lain tetap tergambar ---
  for (const h of ['dashboard','mytask','projects','timeline','calendar','promo','purchasing','tim']) {
    let e=null; try{ W.APP.go(h); }catch(x){ e=x; }
    cek(!e && v().innerHTML.length>50, 'halaman '+h+' tergambar'+(e?' — '+e.message:''));
  }
  W.APP.bukaProject('pj1');
  cek(/APP\.setPd\('mode','kanban'\)/.test(v().innerHTML) && /APP\.setPd\('mode','timeline'\)/.test(v().innerHTML), 'detail project punya tab Kanban & Timeline');
  cek(v().innerHTML.indexOf('Koordinasi divisi lain')<0, 'kartu Koordinasi dicabut dari detail project');
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+e.stack); gagal++; selesai(); });
