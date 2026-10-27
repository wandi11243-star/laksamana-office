/* uji-pola-ulang-bd.js — Task Management: pola berulang ala Google Calendar (27 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-pola-ulang-bd.js
 *
 * Yang dijaga:
 *  1. MESIN: langkahUlang untuk preset lama (tidak berubah arti) & baru
 *     (Selasa ke-4, Selasa terakhir, tahunan) serta kustom (tiap N, hari
 *     terpilih, bulan tanpa "ke-5" dilompati).
 *  2. BERAKHIR: 'sampai tanggal' & 'N kali' menghentikan lahirkanUlang DAN
 *     gulirUlang; kejadian yang terlewat ikut dihitung.
 *  3. MODAL: pilihan berlabel dari deadline, panel Kustom tersimpan sebagai
 *     string 'k/…', isian salah ditolak, pola kustom tersimpan terbuka lagi.
 * Tanggal fixture dipatok absolut untuk mesin (fungsi murni); yang bergantung
 * hari ini memakai tanggal relatif.
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
  '\nwindow.__uji={get DB(){return DB;},langkah:langkahUlang,label:labelUlang,parse:parseUlang,berakhir:seriBerakhir,'+
  'lahirkan:lahirkanUlang,gulir:gulirUlang,taskModal:taskModal,simpanTask:simpanTask};\n' + ASLI.slice(iTutup);

function iso(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const now=Date.now();
const SEED = {
  people:[{id:'p1',name:'Wandi Pranata',div:'Business Development',active:true,officeUserId:'u1'}],
  projects:[],
  tasks:[
    // N kali: 2 kejadian di rantai + 1 terlewat = 3 dari 3 -> habis
    {id:'x0',name:'Servis AC',div:'Business Development',pics:['p1'],status:'Done',doneAt:iso(-20),daily:true,ulang:'k/1/minggu//tgl/x:3',deadline:iso(-20),updatedAt:now},
    {id:'x1',name:'Servis AC',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'k/1/minggu//tgl/x:3',ulangDari:'x0',deadline:iso(-1),terlewat:[{d:iso(-8),sub:''}],updatedAt:now},
    // sampai tanggal: berikutnya (+7) melewati batas -> berhenti
    {id:'d1',name:'Rapat promo',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'k/1/minggu//tgl/d:'+iso(3),deadline:iso(-1),updatedAt:now},
    // kustom tanpa batas, telat -> tetap maju
    {id:'b1',name:'Cek kas',div:'Business Development',pics:['p1'],status:'To Do',daily:true,ulang:'k/2/hari////',deadline:iso(-1),updatedAt:now}
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
const U = () => W.__uji;
const T = id => U().DB.tasks.find(t=>t.id===id);
const g = id => D.getElementById(id);

(async ()=>{
  for(let i=0;i<100 && !(U() && U().DB);i++) await tunggu(50);
  cek(!!(U() && U().DB), 'modul boot');
  await tunggu(200);
  const L=(a,u)=>U().langkah(a,u);

  // ---- 1. mesin ----
  cek(L('2026-10-27','harian')==='2026-10-28', 'harian: +1 hari');
  cek(L('2026-10-30','kerja')==='2026-11-02', 'hari kerja: Jumat -> Senin (tidak berubah arti)');
  cek(L('2026-10-31','kerja')==='2026-11-02', 'hari kerja: Sabtu -> Senin');
  cek(L('2026-10-27','mingguan')==='2026-11-03', 'mingguan: +7 hari');
  cek(L('2026-01-31','bulanan')==='2026-02-28', 'bulanan: 31 Jan dijepit ke 28 Feb');
  cek(L('2026-10-27','bulanan_ke')==='2026-11-24', 'bulanan_ke: Selasa ke-4 Okt -> Selasa ke-4 Nov');
  cek(L('2026-10-27','bulanan_akhir')==='2026-11-24', 'bulanan_akhir: Selasa terakhir Okt -> Selasa terakhir Nov');
  cek(L('2026-09-29','bulanan_akhir')==='2026-10-27', 'bulanan_akhir: Selasa terakhir Sep -> 27 Okt (bukan tanggal 29)');
  cek(L('2026-09-29','bulanan_ke')==='2026-12-29', 'bulanan_ke ke-5: bulan tanpa Selasa ke-5 dilompati');
  cek(L('2028-02-29','tahunan')==='2029-02-28', 'tahunan: 29 Feb dijepit');
  cek(L('2026-10-27','k/2/minggu/2,4///')==='2026-10-29', 'kustom 2 minggu Sel+Kam: Selasa -> Kamis minggu yang sama');
  cek(L('2026-10-29','k/2/minggu/2,4///')==='2026-11-10', 'kustom 2 minggu Sel+Kam: Kamis -> Selasa DUA minggu lagi');
  cek(L('2026-10-27','k/3/hari////')==='2026-10-30', 'kustom tiap 3 hari');
  cek(L('2026-10-27','k/2/bulan//ke/')==='2026-12-22', 'kustom tiap 2 bulan, Selasa ke-4');
  cek(U().parse('k/0/minggu////')===null && U().parse('k/1/abad////')===null && U().parse('aneh')===null, 'string tak sah = tidak berulang');

  // label
  cek(U().label('mingguan','2026-10-27')==='Setiap minggu hari Selasa', 'label mingguan menyebut harinya');
  cek(U().label('bulanan_ke','2026-10-27')==='Setiap bulan, Selasa ke-4', 'label Selasa ke-4');
  cek(U().label('bulanan_akhir','2026-10-27')==='Setiap bulan, Selasa terakhir', 'label Selasa terakhir');
  cek(U().label('tahunan','2026-10-27').indexOf('Setiap tahun 27')===0, 'label tahunan menyebut tanggal');
  cek(U().label('k/2/minggu/1,3///','2026-10-27')==='Setiap 2 minggu: Sen, Rab', 'label kustom mingguan menyebut hari');
  cek(/10× saja$/.test(U().label('k/1/hari///x:10','2026-10-27')), 'label menyebut berakhir N kali');
  cek(/sampai 31 /.test(U().label('k/1/hari///d:2026-12-31','2026-10-27')), 'label menyebut berakhir tanggal');
  cek(U().label('bulanan')==='Setiap bulan', 'tanpa deadline jatuh ke label umum (tes lama tetap cocok)');

  // ---- 2. berakhir ----
  cek(T('x1').deadline===iso(-1), 'seri N kali yang sudah habis TIDAK digeser saat boot');
  cek(T('d1').deadline===iso(-1), 'seri sampai-tanggal yang berikutnya lewat batas TIDAK digeser');
  cek(T('b1').deadline>=iso(0), 'kustom tanpa batas yang telat tetap maju sendiri');
  T('x1').status='Done';
  cek(U().lahirkan(T('x1'))===null, 'seri N kali yang habis tidak melahirkan kejadian baru');
  cek(U().lahirkan(T('d1'))===null, 'seri yang lewat tanggal berakhir tidak melahirkan kejadian baru');
  T('x1').status='To Do';

  // ---- 3. modal ----
  U().taskModal(null);
  const sel=g('m_ulang');
  const val=[...sel.options].map(o=>o.value);
  cek(['','harian','mingguan','bulanan','tahunan','kerja','__kustom'].every(v=>val.indexOf(v)>-1), 'pilihan berulang lengkap + Kustom…');
  g('m_due').value='2026-10-27'; W.APP.ulangSegar();
  cek([...g('m_ulang').options].some(o=>o.value==='bulanan_ke' && /Selasa ke-4/.test(o.textContent)), 'label pilihan ikut deadline: Selasa ke-4');
  cek([...g('m_ulang').options].some(o=>o.value==='bulanan_akhir' && /Selasa terakhir/.test(o.textContent)), 'Selasa terakhir ditawarkan untuk 27 Okt');
  g('m_due').value='2026-10-06'; W.APP.ulangSegar();
  cek(![...g('m_ulang').options].some(o=>o.value==='bulanan_akhir'), '"terakhir" tidak ditawarkan untuk Selasa pertama');
  cek(g('m_kustom').style.display==='none', 'panel Kustom tersembunyi sebelum dipilih');
  g('m_name').value='Pola uji'; g('m_due').value='2026-10-27'; W.APP.ulangSegar();
  g('m_ulang').value='__kustom'; W.APP.ulangUbah();
  cek(g('m_kustom').style.display==='', 'memilih Kustom… membuka panelnya');
  cek(D.querySelector('#m_kHariRow button[data-h="2"]').classList.contains('on'), 'hari deadline (Selasa) sudah tercentang');
  g('m_kTiap').value='2';
  D.querySelector('#m_kHariRow button[data-h="4"]').click();
  D.querySelector('input[name="m_kAkhir"][value="x"]').checked=true; g('m_kKali').value='0';
  let n0=U().DB.tasks.length;
  U().simpanTask('');
  cek(U().DB.tasks.length===n0, 'jumlah kali 0 DITOLAK, tidak tersimpan');
  D.querySelector('input[name="m_kAkhir"][value="d"]').checked=true; g('m_kSampai').value='2026-10-01';
  U().simpanTask('');
  cek(U().DB.tasks.length===n0, 'tanggal berakhir sebelum deadline DITOLAK');
  g('m_kSampai').value='2026-12-31';
  U().simpanTask('');
  const baru=U().DB.tasks.find(t=>t.name==='Pola uji');
  cek(!!baru && baru.ulang==='k/2/minggu/2,4//d:2026-12-31', 'kustom tersimpan sebagai string k/… (tiap 2 minggu, Sel+Kam, sampai 31 Des)');
  g('m_kSatuan') ; // modal sudah tertutup
  U().taskModal(baru.id);
  cek(g('m_ulang').value===baru.ulang && g('m_kustom').style.display==='', 'pola kustom tersimpan terpilih & panelnya terbuka lagi');
  cek(g('m_kTiap').value==='2' && D.querySelector('input[name="m_kAkhir"]:checked').value==='d', 'panel terisi dari pola tersimpan');
  g('m_ulang').value='bulanan_ke'; W.APP.ulangUbah();
  cek(g('m_kustom').style.display==='none', 'memilih preset menyembunyikan panel');
  U().simpanTask(baru.id);
  cek(baru.ulang==='bulanan_ke', 'preset baru tersimpan apa adanya');
  // satuan bulan menampilkan baris mode
  U().taskModal(null); g('m_ulang').value='__kustom'; g('m_kSatuan').value='bulan'; W.APP.ulangUbah();
  cek(g('m_kModeRow').style.display==='' && g('m_kHariRow').style.display==='none', 'satuan bulan: baris "Pada" tampil, hari disembunyikan');
  // Recurring memakai label baru
  W.APP.go && W.APP.go('recurring'); await tunggu(50);
  cek(/Setiap 2 hari/.test(D.getElementById('view').textContent), 'menu Recurring menulis pola kustom dengan kata-kata');
  await tunggu(1200);
  cek(kiriman.some(k=>JSON.stringify(k).indexOf('bulanan_ke')>-1), 'pola baru terkirim lewat saveAll');
  selesai();
})().catch(e=>{ console.log('GAGAL exception '+e.stack); gagal++; selesai(); });
