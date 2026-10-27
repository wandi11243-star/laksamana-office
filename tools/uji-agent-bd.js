/* uji-agent-bd.js — pintu AI agent untuk reminder task lewat chat (26 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-agent-bd.js
 *
 * Dua sisi:
 *  1. FRONTEND: task yang ditutup agent di server (status Done + penanda
 *     penerusTertunda) melahirkan kejadian berikutnya SEKALI, dengan id TETAP,
 *     penandanya dicabut, dan semuanya ikut terkirim lewat saveAll. Balasan
 *     agent (agentLog) tergambar di modal task.
 *  2. BACKEND: PHP tidak bisa dijalankan di mesin ini, jadi sintaksnya lewat
 *     php-parser (kalau ada) dan aturannya dijaga sebagai KONTRAK atas sumber.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function muat(daftar){ for(const p of daftar){ if(!p) continue; try{ return require(p); }catch(e){} } return null; }
const JSDOM_MOD = muat([process.env.JSDOM_PATH, path.join(ROOT,'node_modules','jsdom'), 'C:/Users/LENOVO LEGION/node_modules/jsdom', 'jsdom']);
const PHPP = muat([process.env.PHP_PARSER_PATH, 'php-parser', 'C:/Users/LENOVO LEGION/node_modules/php-parser']);
let ok=0, gagal=0;
function cek(s,p){ if(s){ok++;console.log('OK   '+p);} else {gagal++;console.log('GAGAL '+p);} }
function selesai(){ console.log('\n'+ok+' lulus, '+gagal+' gagal'); process.exit(gagal?1:0); }

/* ---------------- 2. backend (dulu: tidak butuh jsdom) ---------------- */
const LIB = fs.readFileSync(path.join(ROOT,'bd-mysql','lib_agent.php'),'utf8');
const API = fs.readFileSync(path.join(ROOT,'bd-mysql','api.php'),'utf8');
const tanpaKomentar = s => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/mg,'');
const lib = tanpaKomentar(LIB), api = tanpaKomentar(API);
if (PHPP) {
  const P = new PHPP.Engine({parser:{php8:true,suppressErrors:false}});
  for (const [n,s] of [['lib_agent.php',LIB],['api.php',API]]) {
    let sah=true; try{ P.parseCode(s,n); }catch(e){ sah=false; console.log('  '+e.message); }
    cek(sah, 'sintaks PHP sah: '+n);
  }
} else console.log('LEWAT sintaks PHP (php-parser tidak ada)');
function badan(nama){ const i=lib.indexOf('function '+nama+'('); if(i<0) return ''; const j=lib.indexOf('\nfunction ',i+10); return lib.slice(i, j<0?undefined:j); }
cek(/!defined\('AGENT_TOKEN'\)\s*\|\|\s*AGENT_TOKEN === ''/.test(badan('agent_wajib_token')) && /throw/.test(badan('agent_wajib_token')),
  'AGENT_TOKEN kosong = pintu TERTUTUP, bukan terbuka');
cek(/hash_equals\(AGENT_TOKEN/.test(badan('agent_wajib_token')), 'token dibandingkan dengan hash_equals');
cek(!/\$_GET/.test(badan('agent_token_dari')), 'token TIDAK dibaca dari query string');
cek(/\$method !== 'POST'/.test(api.slice(api.indexOf("'agentTugas'"))), 'aksi agent wajib POST');
cek(api.indexOf('agent_wajib_token($body)') > api.indexOf("'agentTugas'") && api.indexOf('agent_wajib_token($body)') < api.indexOf('agent_tugas($body)'),
  'token diperiksa SEBELUM aksi apa pun dijalankan');
cek(/agent_pastikan_pelaksana\(\$t/.test(badan('agent_selesai')) && /agent_pastikan_pelaksana\(\$t/.test(badan('agent_catat')),
  'Selesai & Catat menuntut nomor pengirim = pelaksana task');
cek(/\$roster === null\)\s*throw/.test(badan('agent_pastikan_pelaksana')), 'roster Office tak terbaca = ditolak, bukan diloloskan');
cek(/dependsOn/.test(badan('agent_selesai')) && /Belum bisa Done/.test(badan('agent_selesai')), 'urutan (dependsOn) dihormati seperti cekBolehDone()');
cek(/penerusTertunda'\] = true/.test(badan('agent_selesai')), 'task berulang dapat penanda penerusTertunda');
cek(!/'ulangDari'\s*=>/.test(lib), 'kejadian berikutnya TIDAK dibuat di PHP (aturannya milik frontend)');
cek(!/saveAll|save_all\(/.test(lib), 'tidak lewat saveAll');
cek(/`status` = :st/.test(badan('agent_tulis_task')) && /`updated_at` = :ts/.test(badan('agent_tulis_task')), 'kolom status & updated_at ikut ditulis');
cek(/time\(\) \+ 7 \* 3600/.test(badan('agent_hari_ini')), 'hari ini dihitung WIB');
cek(/'status'\] === 'Done'\) continue/.test(badan('agent_tugas')), 'agentTugas tidak memulangkan task yang sudah Done');
cek(!/'pin'|PIN/.test(lib), 'tidak menyentuh PIN');
const lbl=badan('agent_label_ulang');
cek(lib.indexOf("'berulangTeks' => agent_label_ulang(")>-1 && /bulanan_ke/.test(lbl) && /'x:'/.test(lbl) && /'d:'/.test(lbl), 'agentTugas mengirim pola berulang dalam kata-kata (preset baru & kustom)');
cek(lbl.indexOf('strtotime(')<0, 'hari dihitung tanpa zona server (gmmktime)');

/* ---------------- 1. frontend ---------------- */
if(!JSDOM_MOD){ console.log('LEWAT frontend (jsdom tidak ada)'); selesai(); }
const { JSDOM } = JSDOM_MOD;
const ASLI = fs.readFileSync(path.join(ROOT,'deploy','bd','index.html'),'utf8');
const iTutup = ASLI.lastIndexOf('})();');
const html = ASLI.slice(0,iTutup) +
  '\nwindow.__uji={get DB(){return DB;},lahirkanTertunda:lahirkanTertunda,terapkanGulir:terapkanGulir,agentLogHtml:agentLogHtml,taskModal:taskModal};\n' + ASLI.slice(iTutup);
function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now = Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'}],
  projects:[],
  tasks:[
    // ditutup agent hari ini: Done + penanda
    {id:'gA',name:'Cek Genset',div:'Business Development',pics:['p1'],status:'Done',progress:100,doneAt:iso(0),doneVia:'agent',
     daily:true,ulang:'mingguan',deadline:iso(0),penerusTertunda:true,
     agentLog:[{at:now,jenis:'selesai',oleh:'Wandi Pranata',teks:'Oli aman'}],updatedAt:now},
    // penanda tertinggal di task yang BUKAN berulang lagi: dicabut, tidak melahirkan apa pun
    {id:'gB',name:'Sekali saja',div:'Business Development',pics:['p1'],status:'Done',doneAt:iso(0),daily:true,ulang:'',deadline:iso(0),penerusTertunda:true,updatedAt:now},
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
const DB = () => W.__uji.DB;
const T = id => DB().tasks.find(t=>t.id===id);

(async ()=>{
  for(let i=0;i<100 && !(W.__uji && W.__uji.DB);i++) await tunggu(50);
  cek(!!(W.__uji && W.__uji.DB), 'modul boot');
  await tunggu(200);
  const anak = DB().tasks.filter(t=>t.ulangDari==='gA');
  cek(anak.length===1, 'task berulang yang ditutup agent melahirkan SATU kejadian berikutnya saat boot');
  cek(anak[0] && anak[0].id==='gA_u', 'id penerusnya TETAP (gA_u) — dua tab tidak melahirkan dua');
  cek(anak[0] && anak[0].deadline===iso(7) && anak[0].status==='To Do', 'kejadian berikutnya +7 hari, To Do');
  cek(!T('gA').penerusTertunda && !T('gB').penerusTertunda, 'penanda dicabut, termasuk yang tidak melahirkan apa pun');
  cek(DB().tasks.filter(t=>t.ulangDari==='gB').length===0, 'task yang tidak berulang lagi tidak melahirkan apa pun');
  W.__uji.lahirkanTertunda(); W.__uji.terapkanGulir();
  cek(DB().tasks.filter(t=>t.ulangDari==='gA').length===1, 'dipanggil lagi tidak melahirkan kembaran');
  // tab kedua yang memungut penanda yang sama sesudah tab pertama sudah melahirkan
  T('gA').penerusTertunda=true; W.__uji.lahirkanTertunda();
  cek(DB().tasks.filter(t=>t.ulangDari==='gA').length===1 && !T('gA').penerusTertunda, 'penanda yang dipungut ulang tidak menggandakan');
  await tunggu(1500);
  const s=JSON.stringify(kiriman);
  cek(s.indexOf('"gA_u"')>-1, 'penerusnya terkirim lewat saveAll');
  const kirimA = kiriman.length && (kiriman[kiriman.length-1].data.tasks||[]).find(t=>t.id==='gA');
  cek(kirimA && !kirimA.penerusTertunda, 'penanda yang dicabut ikut terkirim');
  const h=W.__uji.agentLogHtml(T('gA'));
  cek(/Balasan lewat chat/.test(h) && /Oli aman/.test(h) && /Wandi Pranata/.test(h), 'balasan agent tergambar di modal');
  cek(W.__uji.agentLogHtml(T('gB'))==='', 'task tanpa balasan agent tidak menggambar apa pun');
  let modalOk=true; try{ W.__uji.taskModal('gA'); }catch(e){ modalOk=false; console.log('  '+e.message); }
  cek(modalOk && /Oli aman/.test(D.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g,'')), 'modal task benar-benar memuat balasan agent');
  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+e.stack); gagal++; selesai(); });
