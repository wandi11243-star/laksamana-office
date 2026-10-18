/* uji-kembar-bd.js — penanda & penghapus "task kembar" di My Task (18 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-kembar-bd.js
 *
 * 12 Okt 2026 task lama diketik ULANG sebagai Daily Task, jadi satu task
 * berdiri dua baris dan My Task menggambar status yang berbeda dari Daily
 * Task. Alatnya HANYA boleh menghapus versi lama (bukan Daily), satu per
 * satu, dan hanya untuk pasangan tepat satu Daily + satu bukan-Daily.
 * Yang diukur ISI SERVER sesudah simpan, bukan pesan di layar.
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
const html = ASLI.slice(0,iT) + '\nwindow.__uji={get DB(){return DB;},taskKembar:taskKembar,hapusKembar:hapusKembar,get kotor(){return _kotor||_menyimpan;}};\n' + ASLI.slice(iT);

const KOL=['people','projects','tasks','routines','coord','po','agenda','pr'];
const T0=Date.now()-86400000;
const tk=(id,name,daily,status,pics,extra)=>Object.assign({id,name,daily,status,progress:0,deadline:'2026-10-12',pics,pic:pics[0],div:'BD',project:null,subtasks:[],dependsOn:[],updatedAt:T0,createdAt:T0},extra||{});
let SRV={
  people:[{id:'p1',name:'Wandi Pranata',div:'BD',active:true,officeUserId:'u1',updatedAt:T0},{id:'p2',name:'Tegar',div:'BD',active:true,updatedAt:T0}],
  projects:[{id:'pr1',name:'Build System',status:'Aktif',pics:['p1'],updatedAt:T0}],
  tasks:[
    tk('L1','Perlengkapan untuk Palembang',false,'To Do',['p1'],{deadline:'2026-09-18'}),
    tk('D1','Perlengkapan  untuk palembang ',true,'Review',['p1']),
    tk('L2','Evaluasi Harga Online',false,'Review',['p1'],{deadline:'2026-09-17'}),
    tk('D2','Evaluasi Harga Online',true,'To Do',['p1']),
    tk('L3','Cuci Tangki Air',false,'To Do',['p2'],{deadline:'2026-10-15'}),
    tk('D3','Cuci Tangki Air',true,'To Do',['p1']),
    // nama sama TANPA Daily — bukan kembaran ini, tidak boleh disentuh
    tk('K1','KPI Team',false,'To Do',['p1']), tk('K2','KPI Team',false,'To Do',['p1']),
    tk('A1','Absensi',false,'To Do',['p1'],{project:'pr1'}),
    // task lain yang menunggu versi lama: urutannya ikut dilepas
    tk('X1','Kirim ke Palembang',false,'To Do',['p1'],{dependsOn:['L1']})
  ],
  routines:[],coord:[],po:[],agenda:[],pr:[]
};
function getAll(){ const o=JSON.parse(JSON.stringify(SRV)); o.focus={}; o.approverSets=[]; o.promos=[]; return o; }
function saveAll(b){
  const st=b.data||{}, dik=b.dikenal||{};
  KOL.forEach(k=>{ const kirim=st[k]||[]; const ids=new Set(kirim.map(r=>r.id));
    const kenal=new Set(dik[k]||[]);
    SRV[k]=SRV[k].filter(r=>ids.has(r.id)||!kenal.has(r.id));
    kirim.forEach(r=>{ const i=SRV[k].findIndex(x=>x.id===r.id); if(i<0) SRV[k].push(r); else if((+r.updatedAt||0)>=(+SRV[k][i].updatedAt||0)) SRV[k][i]=r; }); });
  return {saved:true,tsMs:Date.now()};
}
let jawabConfirm=true, pesanConfirm=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://dev.laksamanamuda.id/bd/#mytask',
  beforeParse(w){
    w.localStorage.setItem('lm_session',JSON.stringify({expiry:Date.now()+3600000,userId:'u1',name:'Wandi Pranata',modules:['bd'],adminModules:['bd']}));
    w.fetch=async(url,opts)=>{ const u=String(url); let data;
      if(u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',isAdmin:true}]};
      else if(u.indexOf('action=getAll')>-1) data={ok:true,data:getAll()};
      else if(opts&&opts.body){ const b=JSON.parse(opts.body); data=b.action==='saveAll'?{ok:true,data:saveAll(b)}:{ok:true,data:{}}; }
      else data={ok:true,data:{}};
      const t=JSON.stringify(data); return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)}; };
    w.alert=()=>{}; w.confirm=m=>{pesanConfirm.push(m);return jawabConfirm;}; w.scrollTo=()=>{};
  }});
const W=dom.window, tunggu=ms=>new Promise(r=>setTimeout(r,ms));
const ada=id=>SRV.tasks.some(t=>t.id===id);
async function tenang(){ await tunggu(900); for(let i=0;i<60&&W.__uji.kotor;i++) await tunggu(50); await tunggu(400); }

(async()=>{
  for(let i=0;i<100;i++){ try{ if(W.__uji&&W.__uji.DB.tasks.length) break; }catch(e){} await tunggu(50); }
  W.location.hash='#mytask'; await tunggu(300);
  const L=W.__uji.taskKembar();
  cek(L.length===3,'tepat 3 pasangan dikenali (dapat '+L.length+')');
  cek(!L.some(p=>/KPI|Absensi/.test(p.lama.name)),'nama sama TANPA Daily (KPI Team, Absensi) tidak dianggap kembar');
  cek(L.every(p=>!p.lama.daily && p.daily.daily),'yang ditandai "lama" selalu yang bukan Daily');
  cek(L.some(p=>p.lama.id==='L1'&&p.daily.id==='D1'),'huruf besar & spasi diabaikan saat mencocokkan nama');

  const body=W.document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g,'');
  cek(body.indexOf('3 task tercatat dua kali')>-1,'My Task menggambar penanda kembar');
  cek(/versi lama lebih maju \(Review\)/.test(body),'peringatan: versi lama lebih maju (Evaluasi Harga Online)');
  cek(/PIC beda: lama Tegar/.test(body),'peringatan: PIC beda (Cuci Tangki Air)');
  const tombol=[...W.document.querySelectorAll('button')].filter(b=>/hapusKembar/.test(b.getAttribute('onclick')||''));
  cek(tombol.length===3 && tombol.every(b=>/'L\d'/.test(b.getAttribute('onclick'))),'tiap tombol menunjuk versi LAMA, bukan Daily');

  // Batal di dialog = tidak ada yang hilang
  jawabConfirm=false; W.__uji.hapusKembar('L1'); await tenang();
  cek(ada('L1')&&ada('D1'),'menekan Batal tidak menghapus apa pun');

  // Tombol diklik sungguhan
  jawabConfirm=true; pesanConfirm=[];
  tombol.find(b=>/'L1'/.test(b.getAttribute('onclick'))).click(); await tenang();
  cek(!ada('L1'),'versi lama L1 terhapus di server');
  cek(ada('D1') && SRV.tasks.find(t=>t.id==='D1').status==='Review','salinan Daily D1 TETAP, status tetap Review');
  cek(/Dihapus : versi lama, status To Do/.test(pesanConfirm[0]||''),'konfirmasi menyebut yang dihapus & yang tetap');
  cek(SRV.tasks.length===9,'cuma SATU baris yang hilang (sisa 9 dari 10)');
  cek((SRV.tasks.find(t=>t.id==='X1').dependsOn||[]).length===0,'task yang menunggu versi lama dilepas urutannya');
  cek(ada('K1')&&ada('K2')&&ada('A1')&&ada('L2')&&ada('L3'),'baris lain tidak tersentuh');

  // Daily tidak pernah bisa dihapus lewat alat ini
  W.__uji.hapusKembar('D2'); await tenang();
  cek(ada('D2')&&ada('L2'),'id Daily ditolak — alat ini hanya menghapus versi lama');
  W.__uji.hapusKembar('K1'); await tenang();
  cek(ada('K1')&&ada('K2'),'id bukan-kembar (KPI Team) ditolak');
  // Sesudah dihapus, pasangan itu tidak lagi dikenali
  cek(W.__uji.taskKembar().length===2,'sisa 2 pasangan');
  selesai();
})().catch(e=>{ console.log('GAGAL uji tidak selesai: '+(e&&e.stack||e)); gagal++; selesai(); });
