/* uji-lampiran-sub-bd.js — catatan & lampiran sub-task (17 Nov 2026).
 *
 *   JSDOM_PATH=… node tools/uji-lampiran-sub-bd.js
 *
 * Server tiruan HIDUP: apa yang ditulis saveAll dipulangkan getAll berikutnya,
 * dan lampiranUnggah memulangkan kunci seperti lib_bd_lampiran.php. Yang diukur
 * ISI SERVER sesudah simpan, bukan cuma layar. Ditambah kontrak sumber PHP
 * (php-parser) untuk backend yang tidak bisa dijalankan di mesin ini.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(d){ for(const p of d){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
let ok=0, gagal=0;
function cek(s,m){ if(s){ok++;console.log('OK   '+m);} else {gagal++;console.log('GAGAL '+m);} }
function selesai(){ console.log(`\n${ok} lulus, ${gagal} gagal`); process.exit(gagal?1:0); }

/* ---------- kontrak PHP ---------- */
const PHP_LIB = fs.readFileSync(path.join(ROOT,'bd-mysql','lib_bd_lampiran.php'),'utf8');
const PHP_API = fs.readFileSync(path.join(ROOT,'bd-mysql','api.php'),'utf8');
const PP = muat([path.join(ROOT,'node_modules','php-parser')]);
if(PP){
  const p=new PP({parser:{php7:true},ast:{withPositions:false}});
  for(const [n,s] of [['lib_bd_lampiran.php',PHP_LIB],['api.php',PHP_API]]){
    let sah=true; try{ p.parseCode(s); }catch(e){ sah=false; }
    cek(sah,'sintaks PHP sah: '+n);
  }
}
const tanpaKomentar=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const lib=tanpaKomentar(PHP_LIB);
cek(/bdf_' \. bin2hex\(random_bytes\(8\)\)/.test(lib),'kunci berkas bdf_<16 hex>, SAMA dengan laksamana-api');
cek(/BD_LAMPIRAN_MAKS = 8388608/.test(lib),'batas 8 MB, sama dengan laksamana-api');
cek(/filemtime\(\$p\) <= \$batas/.test(lib) && /BD_LAMPIRAN_JEDA = 3600/.test(lib),'berkas yatim baru dibuang sesudah SATU JAM');
cek(/FROM `tasks`/.test(lib) && !/\$body|\$b\['files'\]/.test(lib.slice(lib.indexOf('function lampiran_hidup'))),'kunci hidup dibaca dari DATABASE, bukan dari kiriman');
cek(!/DELETE|TRUNCATE|DROP/i.test(lib),'lib lampiran tidak menyentuh database untuk menghapus apa pun');
cek(/Require all denied/.test(PHP_LIB),'folder lampiran dikunci .htaccess');
cek(/lampiran_kunci_sah\(\$kunci\)/.test(lib),'kunci divalidasi sebelum dibaca dari disk (tanpa ../)');
cek(/\$action === 'lampiranUnggah'/.test(PHP_API) && /\$action === 'lampiran'/.test(PHP_API),'api.php meneruskan lampiranUnggah & lampiran');
cek(/isset\(\$body\['data'\]\)/.test(PHP_API.slice(PHP_API.indexOf('lampiranUnggah'))),'lampiranUnggah membaca {action,data:{…}} kiriman _post()');

if(!JSDOM_MOD){ console.log('LEWAT jsdom (tidak ada)'); selesai(); }
const { JSDOM } = JSDOM_MOD;

const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iT = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iT) + '\nwindow.__uji={get DB(){return DB;},lahirkanUlang:lahirkanUlang,'+
  'setView:function(v){view=v;},render:render,get kotor(){return _kotor||_menyimpan;},get unggah(){return _lampUnggah;}};\n' + ASLI.slice(iT);

const T0=Date.now()-86400000;
const tk=(id,name,o)=>Object.assign({id,name,daily:false,status:'To Do',progress:0,deadline:'2026-11-30',pics:['p1'],pic:'p1',div:'Business Development',
  project:'pr1',subtasks:[],dependsOn:[],updatedAt:T0,createdAt:T0},o||{});
const LAMA={key:'bdf_0123456789abcdef.png',name:'nota.png',mime:'image/png',size:2048};
let SRV={
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1',updatedAt:T0}],
  projects:[{id:'pr1',name:'Renovasi Bar',status:'Aktif',stage:'Execution',div:'Business Development',pics:['p1'],updatedAt:T0}],
  tasks:[
    tk('T1','Pasang ambalan bar',{subtasks:[{id:'s1',t:'Beli besi siku',done:false},{id:'s2',t:'Cat ulang rak',done:false}]}),
    tk('T2','Belanja bulanan',{subtasks:[{id:'s9',t:'Bayar vendor',done:false,note:'Transfer ke rekening BCA',files:[LAMA]}]}),
    tk('T3','Cek stok mingguan',{ulang:'mingguan',deadline:'2026-11-17',subtasks:[{id:'s7',t:'Foto rak',done:true,note:'Foto dari depan',files:[LAMA]}]})
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[]
};
const KOL=['people','projects','tasks','routines','coord','po','agenda','pr'];
let nUnggah=0, terakhirUnggah=null;
function getAll(){ const o=JSON.parse(JSON.stringify(SRV)); o.focus={}; o.approverSets=[]; o.promos=[]; return o; }
function saveAll(b){ const st=b.data||{};
  KOL.forEach(k=>(st[k]||[]).forEach(r=>{ const i=SRV[k].findIndex(x=>x.id===r.id); if(i<0) SRV[k].push(r); else if((+r.updatedAt||0)>=(+SRV[k][i].updatedAt||0)) SRV[k][i]=r; }));
  return {saved:true,tsMs:Date.now()}; }
function unggah(d){ nUnggah++; terakhirUnggah=d;
  return {key:'bdf_'+String(nUnggah).padStart(16,'a')+'.jpg',name:d.fileName,mime:'image/jpeg',size:1234}; }

const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://dev.laksamanamuda.id/bd/#mytask',
  beforeParse(w){
    w.localStorage.setItem('lm_session',JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch=async(url,opts)=>{ const u=String(url); let data;
      if(u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true}]};
      else if(u.indexOf('action=getAll')>-1) data={ok:true,data:getAll()};
      else if(opts&&opts.body){ const b=JSON.parse(opts.body);
        data=b.action==='saveAll'?{ok:true,data:saveAll(b)}:b.action==='lampiranUnggah'?{ok:true,data:unggah(b.data||{})}:{ok:true,data:{}}; }
      else data={ok:true,data:{}};
      const t=JSON.stringify(data); return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)}; };
    w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
    w.Element.prototype.scrollIntoView=function(){};
  }});
const W=dom.window, D=W.document, tunggu=ms=>new Promise(r=>setTimeout(r,ms));
async function tenang(){ await tunggu(900); for(let i=0;i<60&&W.__uji.kotor;i++) await tunggu(50); await tunggu(400); }
const srvTask=id=>SRV.tasks.find(t=>t.id===id);

(async()=>{
  for(let i=0;i<100;i++){ try{ if(W.__uji&&W.__uji.DB.tasks.length) break; }catch(e){} await tunggu(50); }

  /* ---------- 1. modal: catatan + lampiran ---------- */
  W.APP.taskModal('T1'); await tunggu(50);
  const tombol=D.querySelectorAll('#m_subs .sublamp');
  cek(tombol.length===2,'tiap baris sub-task punya tombol Catatan & lampiran');
  cek(!D.querySelector('#m_subs .sublampbox'),'kotaknya tertutup sampai tombolnya ditekan');
  W.APP.subBukaLampiran(0); await tunggu(20);
  const ta=D.querySelector('#m_subs .sublampbox textarea');
  cek(!!ta,'menekan tombolnya membuka kotak catatan');
  ta.value='Ukuran 40 x 40, beli 6 batang'; ta.dispatchEvent(new W.Event('input'));
  cek(D.activeElement!==null && D.querySelector('#m_subs .sublampbox textarea')===ta,'mengetik catatan tidak menggambar ulang kotaknya');

  // unggah: satu berkas sah + satu ditolak di browser
  const inp=D.querySelector('#m_subs .sublampbox input[type=file]');
  cek(!!inp && /pdf/.test(inp.getAttribute('accept')),'pemilih berkas menerima gambar & dokumen');
  const sah=new W.File([new Uint8Array([255,216,255])],'besi.jpg',{type:'image/jpeg'});
  const exe=new W.File([new Uint8Array([77,90])],'virus.exe',{type:'application/x-msdownload'});
  Object.defineProperty(inp,'files',{value:[sah,exe],configurable:true});
  W.APP.subLampirkan(0,inp);
  cek(W.__uji.unggah===1,'hanya berkas yang sah yang diunggah (exe ditolak sebelum dikirim)');
  // simpan saat masih mengunggah ditahan
  W.APP.simpanTask('T1'); await tunggu(30);
  cek(!(srvTask('T1').subtasks[0].files||[]).length,'Simpan ditahan selama lampiran masih diunggah');
  for(let i=0;i<60&&W.__uji.unggah>0;i++) await tunggu(30);
  cek(nUnggah===1 && terakhirUnggah && /^data:image\/jpeg;base64,/.test(terakhirUnggah.dataBase64),'berkas dikirim sebagai data URL ke lampiranUnggah');
  cek(D.querySelectorAll('#m_subs .sublampbox .lampc').length===1,'lampiran yang terunggah tampil di kotaknya');
  cek(D.querySelector('#m_subs .sublampbox textarea').value==='Ukuran 40 x 40, beli 6 batang','catatan yang diketik tetap ada sesudah unggahan selesai');
  W.APP.simpanTask('T1'); await tenang();
  const s1=srvTask('T1').subtasks[0], s2=srvTask('T1').subtasks[1];
  cek(s1.note==='Ukuran 40 x 40, beli 6 batang','catatan sub-task tersimpan di server');
  cek(s1.files && s1.files.length===1 && s1.files[0].key==='bdf_aaaaaaaaaaaaaaa1.jpg' && s1.files[0].name==='besi.jpg','rujukan lampiran tersimpan {key,name,mime,size}');
  cek(!('note' in s2) && !('files' in s2),'sub-task tanpa catatan/lampiran tidak diberi field kosong');

  /* ---------- 2. yang diisi Office baru TIDAK hilang saat disimpan di sini ---------- */
  W.APP.taskModal('T2'); await tunggu(50);
  const nm=D.getElementById('m_name'); nm.value='Belanja bulanan November';
  W.APP.simpanTask('T2'); await tenang();
  const s9=srvTask('T2').subtasks[0];
  cek(srvTask('T2').name==='Belanja bulanan November','task tersunting tersimpan');
  cek(s9.note==='Transfer ke rekening BCA','catatan dari Office baru BERTAHAN saat task disimpan di Office lama');
  cek(s9.files && s9.files[0] && s9.files[0].key===LAMA.key,'lampiran dari Office baru BERTAHAN saat task disimpan di Office lama');

  // menghapus lampiran terakhir & mengosongkan catatan tetap terkirim
  W.APP.taskModal('T2'); await tunggu(50);
  W.APP.subBukaLampiran(0); await tunggu(20);
  cek(D.querySelectorAll('#m_subs .sublampbox .lampc').length===1,'lampiran tersimpan tampil di modal');
  W.APP.subLampiranHapus(0,0); await tunggu(20);
  const ta2=D.querySelector('#m_subs .sublampbox textarea'); ta2.value=''; ta2.dispatchEvent(new W.Event('input'));
  W.APP.simpanTask('T2'); await tenang();
  const s9b=srvTask('T2').subtasks[0];
  cek(Array.isArray(s9b.files) && s9b.files.length===0,'lampiran terakhir yang dihapus terkirim sebagai daftar kosong');
  cek(s9b.note==='','catatan yang dikosongkan terkirim kosong (bukan dibiarkan oleh pengaman server)');

  // Batal tidak menyimpan
  W.APP.taskModal('T1'); await tunggu(50);
  W.APP.subBukaLampiran(1); await tunggu(20);
  const ta3=D.querySelector('#m_subs .sublampbox textarea'); ta3.value='coba'; ta3.dispatchEvent(new W.Event('input'));
  W.closeModal(); await tenang();
  cek(!('note' in srvTask('T1').subtasks[1]),'menutup modal tanpa Simpan tidak menyimpan catatan');

  /* ---------- 3. daftar menampilkan catatan & lampiran ---------- */
  W.__uji.setView('mytask'); W.__uji.render(); await tunggu(50);
  const isi=D.body.innerHTML;
  cek(/Ukuran 40 x 40, beli 6 batang/.test(isi),'catatan sub-task tampil di My Task');
  // T3 juga punya lampiran (kunci lain) — cari milik T1, jangan ambil yang pertama di halaman.
  const a=[...D.querySelectorAll('.sublampinfo .lampc a')].find(x=>/bdf_aaaaaaaaaaaaaaa1/.test(x.getAttribute('href')));
  cek(!!a && /action=lampiran&key=bdf_aaaaaaaaaaaaaaa1\.jpg/.test(a.getAttribute('href')) && a.getAttribute('target')==='_blank','lampiran di daftar membuka ?action=lampiran di tab baru');
  cek(!!D.querySelector('.sublampinfo .lampc img'),'lampiran gambar tampil sebagai pratinjau');

  /* ---------- 4. task berulang: catatan ikut, lampiran tidak ---------- */
  const b=W.__uji.lahirkanUlang(W.__uji.DB.tasks.find(t=>t.id==='T3'));
  cek(!!b && b.subtasks[0].note==='Foto dari depan','kejadian berikutnya membawa catatan sub-task');
  cek(!!b && !('files' in b.subtasks[0]),'kejadian berikutnya TIDAK membawa lampiran');

  selesai();
})().catch(e=>{ console.log('GAGAL (galat) '+e.stack); gagal++; selesai(); });
