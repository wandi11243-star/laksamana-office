/* uji-agenda-luar-bd.js — Task Management, 3 Nov 2026.
 *   JSDOM_PATH=… node tools/uji-agenda-luar-bd.js
 *  1. Jawaban Hadir TERSIMPAN walau resp agenda pulang dari server sebagai [] (bentuk PHP untuk map kosong).
 *  2. Peserta agenda bisa orang Office TANPA akses modul (Tim Kitchen) lewat listDivisiRoster.
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
          {id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'},
          {id:'p3',name:'Budi Santoso',div:'Purchasing',active:true,officeUserId:'u3'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',type:'Event',stage:'Running',pics:['p2'],start:iso(-5),end:iso(20),health:'on-track',
    milestones:[{t:'Soft launch',date:iso(2)}],updatedAt:now}],
  tasks:[
    {id:'tBesok',name:'Kirim proposal sponsor',div:'Business Development',pics:['p2'],status:'To Do',deadline:iso(1),updatedAt:now},
    {id:'tLewat',name:'Rekap vendor',div:'Business Development',pics:['p2'],status:'Doing',deadline:iso(-3),updatedAt:now},
    {id:'tLewat2',name:'Kontrak venue',div:'Business Development',pics:['p2'],status:'To Do',deadline:iso(-6),updatedAt:now},
    {id:'tTanpa',name:'Riset kompetitor',div:'Business Development',pics:['p2'],status:'To Do',deadline:'',updatedAt:now},
    {id:'tR',name:'Desain booth',div:'Business Development',pics:['p1'],status:'Review',reviewers:['p2'],deadline:iso(4),updatedAt:now},
    {id:'tR2',name:'Brief talent',div:'Business Development',pics:['p1'],status:'Review',reviewers:['p2'],reviewAt:now-5000,deadline:iso(5),updatedAt:now},
    {id:'tOrang',name:'Task milik Budi',div:'Purchasing',pics:['p3'],status:'To Do',deadline:iso(1),updatedAt:now}
  ],
  routines:[],coord:[],po:[],pr:[],focus:{},approverSets:[],promos:[],
  agenda:[
    {id:'aTim',title:'Briefing pagi',date:iso(0),type:'Internal',div:'Business Development',updatedAt:now},
    {id:'aUndang',title:'Meeting vendor dekor',date:iso(0),start:'14:00',end:'15:30',type:'Vendor',div:'Business Development',
      owner:'p1',peserta:['p2','p3'],undang:{p2:{at:now-60000},p3:{at:now-60000}},resp:[],updatedAt:now},
    {id:'aMilik',title:'Sync mingguan',date:iso(1),start:'10:00',end:'11:00',type:'Meeting',div:'Business Development',
      owner:'p2',peserta:['p1'],undang:{p1:{at:now-90000}},resp:{p1:{s:'terima',at:now-30000}},updatedAt:now},
    {id:'aLain',title:'Rapat purchasing',date:iso(0),start:'09:00',end:'10:00',type:'Meeting',div:'Purchasing',owner:'p3',peserta:[],updatedAt:now}
  ]
};
let SERVER = JSON.parse(JSON.stringify(SEED));
const kiriman=[];
const dom = new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''), {
  runScripts:'dangerously', pretendToBeVisual:true, url:'https://dev.laksamanamuda.id/bd/#dashboard',
  beforeParse(w){
    w.localStorage.setItem('lm_session', JSON.stringify({expiry:Date.now()+3600000,userId:'u2',name:'Sari Lestari',modules:['bd'],adminModules:[]}));
    w.fetch = async (url, opts)=>{
      const u=String(url); let data;
      if (u.indexOf('account-api')>-1 && opts && String(opts.body).indexOf('listDivisiRoster')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata',keterangan:'BD',active:true},{id:'u2',name:'Sari Lestari',keterangan:'BD',active:true},{id:'u3',name:'Budi Santoso',keterangan:'Purchasing',active:true},{id:'u9',name:'Koki Joko',keterangan:'Kitchen',active:true},{id:'u8',name:'Koki Nonaktif',keterangan:'Kitchen',active:false}]};
      else if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata'},{id:'u2',name:'Sari Lestari'},{id:'u3',name:'Budi Santoso'}]};
      else if (u.indexOf('action=getAll')>-1) data={ok:true,data:JSON.parse(JSON.stringify(SERVER))};
      else if (opts && opts.body){ const b=JSON.parse(opts.body); if(b.action==='saveAll'){ kiriman.push(b); SERVER=JSON.parse(JSON.stringify(b.data)); } data={ok:true,data:{saved:true,tsMs:Date.now()}}; }
      else data={ok:true,data:{}};
      const teks=JSON.stringify(data);
      return { ok:true, status:200, text:async()=>teks, json:async()=>JSON.parse(teks) };
    };
    w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{}; w.prompt=()=>'Warna booth belum sesuai brand';
  }
});
const W = dom.window, D = W.document;
const tunggu = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  await tunggu(900);
  const U=W.__uji;
  /* 1. Hadir dari menu Undangan */
  U.ev("go('inbox')"); await tunggu(100);
  const tHadir=[...D.querySelectorAll('button')].find(b=>b.textContent==='Hadir' && (b.getAttribute('onclick')||'').indexOf('aUndang')>-1);
  cek(!!tHadir,'undangan aUndang punya tombol Hadir');
  if(tHadir) tHadir.click();
  await tunggu(1500);
  const aSrv=(SERVER.agenda||[]).find(a=>a.id==='aUndang');
  cek(aSrv && aSrv.resp && !Array.isArray(aSrv.resp) && aSrv.resp.p2 && aSrv.resp.p2.s==='terima','resp:[] dari server -> jawaban Hadir TERSIMPAN', JSON.stringify(aSrv&&aSrv.resp));

  /* 2. Undang orang Office tanpa akses (Kitchen) */
  U.ev("agendaModal('',null,null)"); await tunggu(80);
  const btnK=[...D.querySelectorAll('[data-undiv]')].find(b=>b.getAttribute('data-undiv')==='Kitchen');
  cek(!!btnK && !btnK.disabled,'tombol Undang Kitchen hidup walau tidak ada kru ber-akses');
  cek(btnK && /tanpa akses/.test(btnK.textContent),'tombolnya menyebut tanpa akses', btnK&&btnK.textContent);
  const chipJoko=D.querySelector('#a_pes .picchip[data-id="o:u9"]');
  cek(!!chipJoko,'Koki Joko tampil sebagai pilihan peserta');
  cek(!D.querySelector('#a_pes .picchip[data-id="o:u8"]'),'user Office nonaktif tidak ditawarkan');
  cek(!D.querySelector('#a_pes .picchip[data-id="o:u1"]'),'kru yang sudah punya akses tidak digandakan');
  if(btnK) btnK.click();
  cek(chipJoko && chipJoko.classList.contains('on'),'Undang Kitchen mencentang Koki Joko');
  D.getElementById('a_title').value='Briefing dapur';
  U.ev("simpanAgenda('')"); await tunggu(1500);
  const aBaru=(SERVER.agenda||[]).find(a=>a.title==='Briefing dapur');
  cek(aBaru && aBaru.peserta.indexOf('o:u9')>-1,'peserta o:u9 tersimpan di server', JSON.stringify(aBaru&&aBaru.peserta));
  cek(aBaru && aBaru.pesertaNama && aBaru.pesertaNama['o:u9']==='Koki Joko','nama peserta tanpa akses ikut tersimpan');
  cek(U.ev("P('o:u9').name")==='Koki Joko','P() mengenali peserta tanpa akses');
  /* Pilihan PIC task TIDAK ikut memuat orang luar */
  U.ev("taskModal('')"); await tunggu(60);
  cek(!D.querySelector('#m_pics .picchip[data-id^="o:"]'),'orang tanpa akses TIDAK jadi pilihan PIC task');
  U.ev('closeModal()');
  if(aBaru){ U.ev("agendaBuka('"+aBaru.id+"')"); await tunggu(60);
    cek(/tidak bisa menjawab/.test(D.getElementById('overlay').textContent),'detail agenda menyebut peserta tanpa akses tidak bisa menjawab'); }
  selesai();
})();
