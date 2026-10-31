/* uji-kal-luar-bd.js — Calendar BD: lima kategori + acara dari modul lain (30 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-kal-luar-bd.js
 *
 *  1. Chip kategori tinggal lima: Deadline Task · Meeting · Event · Marketing · Reservasi.
 *     Milestone & PO tidak lagi di kalender; seluruh agenda masuk Meeting.
 *  2. Event / Marketing / Reservasi dibaca dari modulnya (agendaRentang /
 *     getAll berjendela), hanya yang deal; VIP salinan di Reservasi tidak dobel.
 *  3. Reservasi = satu chip per hari; klik membuka daftarnya.
 *  4. Modul yang mati DIKATAKAN.
 *  5. Kontrak PHP agendaRentang (php-parser + sumber).
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(d){ for(const p of d){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JM = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
const PP = muat([process.env.PHP_PARSER_PATH, 'php-parser', 'C:/Users/LENOVO LEGION/node_modules/php-parser']);
let ok=0, gagal=0;
function cek(s,p,k){ if(s){ok++;console.log('OK   '+p);} else {gagal++;console.log('GAGAL '+p+(k?'  — '+k:''));} }
function selesai(){ console.log('\n'+ok+' lulus, '+gagal+' gagal'); process.exit(gagal?1:0); }

/* ---------- 5. kontrak PHP ---------- */
const libM=fs.readFileSync(path.join(ROOT,'marketing-mysql','lib_marketing_mysql.php'),'utf8');
const apiM=fs.readFileSync(path.join(ROOT,'marketing-mysql','api.php'),'utf8');
const libE=fs.readFileSync(path.join(ROOT,'event-mysql','lib_event_mysql.php'),'utf8');
const apiE=fs.readFileSync(path.join(ROOT,'event-mysql','api.php'),'utf8');
if(PP){ const p=new PP({parser:{php7:true},ast:{withPositions:false}});
  [['marketing lib',libM],['marketing api',apiM],['event lib',libE],['event api',apiE]].forEach(([n,src])=>{
    let e=null; try{ p.parseCode(src); }catch(x){ e=x; } cek(!e, 'sintaks PHP '+n, e&&e.message); });
} else console.log('LEWAT sintaks PHP (php-parser tidak ada)');
const potong=(src,nm)=>{ const i=src.indexOf('function '+nm+'('); if(i<0) return ''; const j=src.indexOf('\nfunction ',i+10); return src.slice(i,j<0?undefined:j); };
const fM=potong(libM,'agenda_rentang'), fE=potong(libE,'agenda_rentang');
cek(/action === 'agendaRentang'/.test(apiM) && /action === 'agendaRentang'/.test(apiE), 'kedua api.php punya aksi agendaRentang');
cek(/status IN \('Deal', 'Confirmed', 'Event Done'\)/.test(fM), 'marketing: hanya Deal / Confirmed / Event Done');
cek(/batalAt/.test(fM) && /extra:vip/.test(fM), 'marketing: VIP dibaca dari extra:vip, yang batalAt dibuang');
cek(!/nominal|grand|harga/i.test(fM.replace(/\/\*[\s\S]*?\*\//g,'')), 'marketing: tidak memulangkan angka uang');
cek(/'Approval', 'Upcoming', 'Event Done'/.test(fE), 'event: hanya Approval / Upcoming / Event Done');
cek(!/\b(INSERT|UPDATE|DELETE)\b/.test(fM+fE), 'agenda_rentang hanya membaca');
cek(/100 \* 86400/.test(fM) && /100 \* 86400/.test(fE), 'rentang dibatasi 100 hari');

if(!JM){ console.log('LEWAT (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JM;
const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) + '\nwindow.__uji={get DB(){return DB;},ev:function(x){return eval(x);}};\n' + ASLI.slice(iTutup);
function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now=Date.now();
const SEED={ people:[{id:'p2',name:'Sari Lestari',div:'Business Development',active:true,officeUserId:'u2'}],
  projects:[{id:'pj1',name:'Grand Opening',div:'Business Development',stage:'Running',pics:['p2'],milestones:[{t:'Soft launch',date:iso(0)}],updatedAt:now}],
  tasks:[{id:'t1',name:'Kirim proposal',div:'Business Development',pics:['p2'],status:'To Do',deadline:iso(0),updatedAt:now}],
  po:[{id:'po1',item:'Kursi lipat',needBy:iso(0),pic:'p2',div:'Business Development',status:'Draft',updatedAt:now}],
  routines:[],coord:[],pr:[],focus:{},approverSets:[],promos:[],
  agenda:[{id:'aV',title:'Rapat vendor',date:iso(0),start:'09:00',end:'10:00',type:'Vendor',div:'Business Development',owner:'p2',peserta:[],updatedAt:now}]};
const minta=[]; let EVT_MATI=false;
const dom=new JSDOM(html.replace(/<script[^>]+src=[^>]*><\/script>/g,''),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://dev.laksamanamuda.id/bd/#calendar',
  beforeParse(w){
    w.localStorage.setItem('lm_session',JSON.stringify({expiry:Date.now()+3600000,userId:'u2',name:'Sari Lestari',modules:['bd'],adminModules:[]}));
    w.fetch=async(url)=>{ const u=String(url); minta.push(u); let data, st=200;
      if(u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u2',name:'Sari Lestari'}]};
      else if(u.indexOf('marketing-api')>-1) data={ok:true,data:{events:[
          {id:'m1',nama:'Gathering PT Maju',tanggal:iso(0),selesai:iso(1),status:'Deal',pax:80,jam:'19.00',jamAkhir:'22:00',tempat:'Rooftop'}],
        vip:[{id:'v1',nama:'Bu Nana',tanggal:iso(0),status:'Confirmed',jam:'12:00',jamAkhir:'14:00',paxMin:60,paxMax:80,meja:['R1','R3']}]}};
      else if(u.indexOf('event-api')>-1){ if(EVT_MATI){ st=500; data={ok:false,error:'mati'}; }
        else data={ok:true,data:{events:[{id:'e1',nama:'Live Music Fuego',tanggal:iso(0),jam:'20:00',jamAkhir:'23:00',status:'Upcoming',tempat:'Main stage',pax:120}]}}; }
      else if(u.indexOf('reservasi-api')>-1) data={ok:true,data:{reservations:[
          {id:'r1',date:iso(0),time:'18:00',name:'Andi',pax:4,table:'12',status:'Confirmed'},
          {id:'r2',date:iso(0),time:'19:30',name:'Budi',pax:6,table:'14',status:'Datang'},
          {id:'r3',date:iso(0),time:'19:00',name:'Cici',pax:2,table:'3',status:'Pending'},
          {id:'r4',date:iso(0),time:'20:00',name:'Dodo',pax:3,table:'5',status:'Cancelled'},
          {id:'vip-v1',date:iso(0),time:'12:00',name:'Bu Nana',pax:80,table:'R1',status:'Confirmed'}]}};
      else if(u.indexOf('action=getAll')>-1) data={ok:true,data:JSON.parse(JSON.stringify(SEED))};
      else data={ok:true,data:{}};
      const t=JSON.stringify(data); return {ok:st===200,status:st,text:async()=>t,json:async()=>JSON.parse(t)}; };
    w.alert=()=>{}; w.confirm=()=>true; w.scrollTo=()=>{};
  }});
const W=dom.window, D=W.document;
const tunggu=ms=>new Promise(r=>setTimeout(r,ms));
const view=()=>D.getElementById('view');
const teks=el=>(el?el.textContent:'').replace(/\s+/g,' ');
(async()=>{
  for(let i=0;i<60 && !(W.__uji && W.__uji.DB && W.__uji.DB.people.length);i++) await tunggu(50);
  await tunggu(300);
  const ev=x=>W.__uji.ev(x);
  W.APP.go('calendar'); W.APP.calSet({scope:'saya',mode:'daftar',date:iso(0)}); await tunggu(150);

  const chips=[...view().querySelectorAll('.fchips .fchip')].map(c=>c.textContent.trim());
  cek(chips.join('|')==='Deadline Task|Meeting|Event|Marketing|Reservasi', 'chip kategori tinggal lima', chips.join('|'));
  const v=teks(view());
  cek(!/Soft launch/.test(v) && !/Kursi lipat/.test(v), 'milestone & PO tidak lagi di kalender');
  const itV=[...view().querySelectorAll('.it')].find(x=>/Rapat vendor/.test(x.textContent));
  cek(itV && /Meeting/.test(teks(itV.querySelector('.tag'))), 'agenda berjenis Vendor masuk kategori Meeting', itV&&teks(itV));
  cek(/Gathering PT Maju/.test(v), 'event Marketing yang Deal tampil');
  cek(/VIP · Bu Nana/.test(v), 'Reservasi VIP Marketing tampil');
  cek(/Live Music Fuego/.test(v), 'event dari modul Event tampil');
  const itM=[...view().querySelectorAll('.it')].find(x=>/Gathering PT Maju/.test(x.textContent));
  cek(itM && /19:00/.test(teks(itM)), 'jam "19.00" dibaca jadi 19:00', itM&&teks(itM));
  const rs=[...view().querySelectorAll('.it')].filter(x=>/Reservasi ·/.test(x.textContent));
  cek(rs.length===1, 'reservasi jadi SATU baris per hari', rs.length);
  cek(rs[0] && /2 booking · 10 pax/.test(teks(rs[0])), 'hanya Confirmed & Datang dihitung, salinan VIP tidak dobel', rs[0]&&teks(rs[0]));
  const mU=minta.filter(u=>u.indexOf('marketing-api')>-1);
  cek(mU.length===1 && /action=agendaRentang/.test(mU[0]) && !/getAll/.test(mU[0]), 'Marketing dibaca lewat agendaRentang, bukan getAll', mU.join(' '));
  cek(minta.some(u=>/reservasi-api.*action=getAll&dari=\d{4}-\d{2}-\d{2}&sampai=/.test(u)), 'Reservasi dibaca getAll BERJENDELA');

  W.APP.calSet({mode:'daftar',date:iso(1)}); await tunggu(100);
  cek(/Gathering PT Maju/.test(teks(view())), 'acara lintas hari muncul di hari keduanya');
  cek(minta.filter(u=>u.indexOf('marketing-api')>-1).length===1, 'rentang yang sudah dimuat tidak ditarik ulang');

  W.APP.calSet({mode:'daftar',date:iso(0)}); await tunggu(50);
  rs[0] && [...view().querySelectorAll('.it')].find(x=>/Reservasi ·/.test(x.textContent)).click(); await tunggu(30);
  const md=teks(D.getElementById('modal'));
  cek(/Andi/.test(md) && /Budi/.test(md) && !/Cici/.test(md) && !/Dodo/.test(md), 'klik reservasi membuka daftar booking yang deal', md.slice(0,200));
  ev('closeModal()');
  [...view().querySelectorAll('.it')].find(x=>/Live Music Fuego/.test(x.textContent)).click(); await tunggu(30);
  const me=teks(D.getElementById('modal'));
  cek(/Main stage/.test(me) && /Buka modul Event/.test(me) && /20:00–23:00/.test(me), 'klik event membuka detail + tautan modul Event', me.slice(0,200));
  ev('closeModal()');

  W.APP.calSet({mode:'hari',date:iso(0)}); await tunggu(50);
  cek(!!view().querySelector('.vg-c .blk') && /Live Music Fuego/.test(teks(view().querySelector('.vg-c'))), 'event berjam digambar sebagai blok di grid jam');
  cek(/Reservasi ·/.test(teks(view().querySelector('.vg-a'))), 'reservasi di baris "tanpa jam"');

  W.APP.calToggle('rsv'); await tunggu(30);
  cek(!/Reservasi ·/.test(teks(view())), 'chip Reservasi dimatikan → reservasi hilang');
  W.APP.calToggle('rsv'); await tunggu(30);

  EVT_MATI=true; W.APP.muatLuarUlang(); await tunggu(150);
  const pita=teks(view().querySelector('.notice.warn'));
  cek(/Event/.test(pita) && /bukan berarti tidak ada/.test(pita), 'modul Event mati → dikatakan di pita', pita);
  cek(/Gathering PT Maju/.test(teks(view())), 'sumber lain tetap tampil walau satu modul mati');
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+(e&&e.stack||e)); gagal++; selesai(); });
