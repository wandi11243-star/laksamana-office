/* uji-tag-bd.js — Task Management: tag "untuk siapa" di task (15 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-tag-bd.js
 *
 * Warna: tag baru diacak dari palet, bisa diganti, tersimpan per tag.
 * Pilihan tag dihitung dari tag yang dipakai task mana pun; boleh lebih dari
 * satu; tag baru tinggal diketik. Yang diukur DATANYA (t.tags & kiriman).
 */
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
  '\nwindow.__uji={get DB(){return DB;},get view(){return view;},langkah:langkahUlang,berikut:deadlineBerikut,ev:function(x){return eval(x);}};\n' + ASLI.slice(iTutup);

function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'},
          {id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Running',pics:['p1'],start:iso(-5),end:iso(20),health:'on-track',updatedAt:now}],
  tasks:[
    {id:'dA',tags:['Klien Toffin'],name:'Cek stok bar',div:'Business Development',pics:['p1','p2'],status:'To Do',daily:true,ulang:'harian',deadline:iso(0),
      subtasks:[{id:'s1',t:'Hitung botol',done:true,d:iso(0)}],updatedAt:now},
    {id:'dB',name:'Rekap kas mingguan',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'mingguan',deadline:iso(-10),updatedAt:now},
    {id:'dC',name:'Bersih gudang',div:'Business Development',pics:['p1'],status:'Doing',daily:true,deadline:iso(1),updatedAt:now},
    {id:'tP',name:'Task project biasa',div:'Business Development',pics:['p1'],status:'To Do',project:'pj1',deadline:iso(3),updatedAt:now}
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[],focus:{},approverSets:[],promos:[]
};
let SERVER = JSON.parse(JSON.stringify(SEED));
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#daily',
  beforeParse(w){
    w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch = async (url, opts)=>{
      const u=String(url); let data;
      if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true},{id:'u2',name:'Sari Lestari'}]};
      /* Server tiruan HIDUP: yang ditulis saveAll dipulangkan getAll berikutnya.
         Modul menarik getAll sesudah tiap simpan (18 Okt 2026); tiruan statis
         akan mengembalikan SEED dan membuang yang barusan disimpan — perilaku
         yang tidak pernah ada di server sungguhan. */
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
const anak = id => DB().tasks.filter(t=>t.ulangDari===id);
const v = () => D.getElementById('view');

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(200);

  // --- tag tampil di daftar Daily ---
  cek(/#Klien Toffin/.test(v().innerHTML), 'tag task tampil di Daily Task');

  // --- modal baru: tag yang pernah dipakai ditawarkan, tidak ada yang menyala ---
  W.APP.taskModal(null,'__daily__');
  const chips=()=>[...D.querySelectorAll('#m_tags .tagchip')];
  cek(chips().some(b=>b.getAttribute('data-tag')==='Klien Toffin'), 'tag yang sudah dipakai task lain ditawarkan sebagai pilihan');
  cek(!chips().some(b=>b.classList.contains('on')), 'task baru lahir tanpa tag terpilih');

  // --- ketik tag baru (dua sekaligus, koma) + Enter ---
  const inp=D.getElementById('m_tagBaru');
  inp.value='Andi, #Divisi Bar';
  inp.dispatchEvent(new W.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  const on=()=>chips().filter(b=>b.classList.contains('on')).map(b=>b.getAttribute('data-tag'));
  cek(on().indexOf('Andi')>-1 && on().indexOf('Divisi Bar')>-1, 'tag baru diketik lalu Enter langsung terpilih (koma memisah, # dibuang)');
  cek(D.getElementById('m_tagBaru').value==='', 'kotak ketik dikosongkan sesudah tag masuk');

  // --- ejaan beda huruf besar memakai tag yang ada, tidak kembar ---
  inp.value='klien toffin';
  W.APP.tagTambah();
  cek(on().filter(x=>x.toLowerCase()==='klien toffin').length===1 && on().indexOf('Klien Toffin')>-1,
      'ejaan beda huruf besar-kecil memakai tag yang sudah ada, tidak jadi kembar');
  cek(!W.__uji.ev("_warnaDraft['klien toffin']"), 'tag lama tanpa warna tersimpan yang diketik ulang TIDAK diberi warna acak');

  // --- klik chip = lepas pilihan ---
  chips().find(b=>b.getAttribute('data-tag')==='Andi').click();
  cek(on().indexOf('Andi')===-1, 'menekan chip yang menyala melepasnya');
  chips().find(b=>b.getAttribute('data-tag')==='Andi').click();

  // --- tag yang masih di kotak ketik ikut saat Simpan ---
  D.getElementById('m_name').value='Task bertag';
  inp.value='Owner';
  const nKirim=kiriman.length;
  W.APP.simpanTask('');
  const baru=DB().tasks.find(t=>t.name==='Task bertag');
  cek(!!baru, 'task tersimpan');
  cek(baru && JSON.stringify(baru.tags.slice().sort())===JSON.stringify(['Andi','Divisi Bar','Klien Toffin','Owner']),
      'tags tersimpan di task (termasuk yang masih di kotak ketik): '+JSON.stringify(baru&&baru.tags));
  await tunggu(1500);
  cek(kiriman.length>nKirim && JSON.stringify(kiriman.slice(nKirim)).indexOf('"Divisi Bar"')>-1, 'tags ikut terkirim ke server');

  // --- Batal tidak menyimpan perubahan tag ---
  W.APP.taskModal(baru.id);
  cek(chips().filter(b=>b.classList.contains('on')).length===4, 'membuka task lama menyalakan tag-nya');
  chips().find(b=>b.getAttribute('data-tag')==='Owner').click();
  D.querySelector('.modal-f .btn:not(.pri):not(.bad)').click();
  cek(baru.tags.indexOf('Owner')>-1, 'Batal tidak ikut menyimpan perubahan tag');

  // --- melepas semua tag ---
  W.APP.taskModal(baru.id);
  chips().filter(b=>b.classList.contains('on')).forEach(b=>b.click());
  W.APP.simpanTask(baru.id);
  cek(Array.isArray(baru.tags) && baru.tags.length===0, 'semua tag bisa dilepas');

  // --- task berulang menurunkan tag ke kejadian berikutnya ---
  W.APP.toggleTask('dA');
  const lahir=DB().tasks.find(t=>t.ulangDari==='dA');
  cek(lahir && JSON.stringify(lahir.tags)===JSON.stringify(['Klien Toffin']), 'task berulang menyalin tag ke kejadian berikutnya');

  // --- tag tampil di Kanban & detail project ---
  T('tP').tags=['Vendor X'];
  W.APP.go('board'); await tunggu(50);
  cek(/#Vendor X/.test(v().innerHTML), 'tag tampil di kartu Kanban');
  W.APP.bukaProject && W.APP.bukaProject('pj1'); await tunggu(50);
  cek(/#Vendor X/.test(v().innerHTML), 'tag tampil di detail project');

  // --- nama tag di-escape ---
  T('tP').tags=['<b>x</b>'];
  W.APP.go('board'); await tunggu(50);
  /* Lewat DOM, bukan innerHTML: jsdom menserialkan atribut title tanpa escape <, jadi pencarian teks cocok dengan atribut yang aman. */
  cek(!v().querySelector('.tag.untuk b') && [...v().querySelectorAll('.tag.untuk')].some(e=>e.textContent==='#<b>x</b>'), 'nama tag di-escape');

  // ===== WARNA TAG =====
  const PALET = W.__uji.ev('TAG_PALET');
  const warnaChip = tag => { const b=chips().find(x=>x.getAttribute('data-tag')===tag); return b && b.querySelector('.tdot').style.background; };
  const hex2rgb = h => 'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';

  // tag lama tanpa warna tersimpan: warna turunan nama, stabil
  W.APP.taskModal(null,'__daily__');
  const w1=warnaChip('Klien Toffin');
  W.APP.tagBukaWarna(''); W.APP.taskModal(null,'__daily__');
  cek(!!w1 && w1===warnaChip('Klien Toffin'), 'tag lama tanpa warna tersimpan memakai warna stabil (tidak berganti tiap buka)');

  // tag baru → warna acak dari palet, belum tersimpan sebelum Simpan
  const inp2=D.getElementById('m_tagBaru');
  inp2.value='Tamu VIP'; W.APP.tagTambah();
  const wBaru=W.__uji.ev("_warnaDraft['tamu vip']");
  cek(PALET.indexOf(wBaru)>-1, 'tag baru diberi warna acak dari palet: '+wBaru);
  cek(warnaChip('Tamu VIP')===hex2rgb(wBaru), 'chip tag baru tergambar dengan warnanya');
  cek(!DB().tagWarna['tamu vip'], 'warna tag baru belum tersimpan sebelum Simpan');

  // ganti warna lewat titik warna
  D.querySelector('#m_tags .tagchip[data-tag="Tamu VIP"] .tdot').click();
  cek(!!D.querySelector('#m_tagWarna .twarna'), 'menekan titik warna membuka pilihan warna');
  cek(W.__uji.ev("_tagDraft").filter(x=>x==='Tamu VIP').length===1, 'menekan titik warna TIDAK ikut melepas/menyalakan tag');
  const lain=PALET.find(c=>c!==wBaru);
  D.querySelector('#m_tagWarna .sw[title="'+lain+'"]').click();
  cek(W.__uji.ev("_warnaDraft['tamu vip']")===lain, 'warna bisa diganti dari palet');
  D.getElementById('m_name').value='Task VIP';
  W.APP.simpanTask('');
  cek(DB().tagWarna['tamu vip']===lain, 'warna tersimpan di DB.tagWarna saat Simpan');
  await tunggu(1500);
  cek(JSON.stringify(kiriman[kiriman.length-1]).indexOf('"tamu vip":"'+lain+'"')>-1, 'tagWarna ikut terkirim ke server');
  W.APP.go('daily'); await tunggu(50);
  const span=[...v().querySelectorAll('.tag.untuk')].find(e=>e.textContent==='#Tamu VIP');
  cek(span && span.getAttribute('style').indexOf(lain)>-1, 'tag di daftar tergambar dengan warna yang dipilih');

  // Batal tidak mengubah warna
  W.APP.taskModal(null,'__daily__');
  D.querySelector('#m_tags .tagchip[data-tag="Tamu VIP"] .tdot').click();
  D.querySelector('#m_tagWarna .sw[title="'+wBaru+'"]').click();
  D.querySelector('.modal-f .btn:not(.pri):not(.bad)').click();
  cek(DB().tagWarna['tamu vip']===lain, 'Batal tidak mengubah warna tag');

  // tag lama yang diketik ulang tidak diacak ulang
  W.APP.taskModal(null,'__daily__');
  D.getElementById('m_tagBaru').value='tamu vip'; W.APP.tagTambah();
  cek(!W.__uji.ev("_warnaDraft['tamu vip']"), 'mengetik tag yang sudah ada tidak mengacak ulang warnanya');
  D.getElementById('m_tagBaru').value='klien toffin'; W.APP.tagTambah();
  cek(!W.__uji.ev("_warnaDraft['klien toffin']") && warnaChip('Klien Toffin')===w1, 'tag lama TANPA warna tersimpan yang diketik ulang tetap memakai warnanya, tidak diacak');
  D.querySelector('.modal-f .btn:not(.pri):not(.bad)').click();

  // kontrak PHP: digabung, bukan ditimpa
  const php=fs.readFileSync(path.join(ROOT,'bd-mysql','lib_bd_mysql.php'),'utf8');
  cek(/\$out\['tagWarna'\]\s*=\s*\(object\)get_setting\('tagWarna'/.test(php), 'php: getAll memulangkan tagWarna');
  cek(/\$tw = get_setting\('tagWarna'[\s\S]{0,600}\$tw\[\$k\] = \$c;[\s\S]{0,200}put_setting\(\$pdo, 'tagWarna'/.test(php), 'php: tagWarna digabung per kunci dengan yang tersimpan');
  cek(/preg_match\('\/\^#\[0-9a-fA-F\]\{6\}\$\/'/.test(php), 'php: warna yang bukan #rrggbb dibuang');
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+(e&&e.stack||e)); gagal++; selesai(); });
