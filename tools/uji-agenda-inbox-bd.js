/* uji-agenda-inbox-bd.js — Task Management, bentuk LM Agenda (30 Okt 2026).
 *
 *   JSDOM_PATH=… node tools/uji-agenda-inbox-bd.js
 *
 *  1. Dashboard: tiga kolom Hari ini / Besok / Lusa berisi urusanku, pita
 *     yang menuntut tindakan, kartu "belum ada deadline" & "menunggu respons".
 *  2. Calendar: pemilih lingkup, mode Hari/Minggu/Bulan/Daftar, grid jam,
 *     baris per orang untuk divisi, chip penyaring per jenis.
 *  3. Menu Undangan & Notifikasi: undangan agenda bisa dijawab, task Review
 *     bisa disetujui/dikembalikan reviewer, notifikasi dihitung dari data.
 * Yang diukur ISI SERVER & DOM, bukan teks toast. Sesinya non-admin (Sari).
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
    {id:'tTanpa',name:'Riset kompetitor',div:'Business Development',pics:['p2'],status:'To Do',deadline:'',updatedAt:now},
    {id:'tR',name:'Desain booth',div:'Business Development',pics:['p1'],status:'Review',reviewers:['p2'],deadline:iso(4),updatedAt:now},
    {id:'tR2',name:'Brief talent',div:'Business Development',pics:['p1'],status:'Review',reviewers:['p2'],reviewAt:now-5000,deadline:iso(5),updatedAt:now},
    {id:'tOrang',name:'Task milik Budi',div:'Purchasing',pics:['p3'],status:'To Do',deadline:iso(1),updatedAt:now}
  ],
  routines:[],coord:[],po:[],pr:[],focus:{},approverSets:[],promos:[],
  agenda:[
    {id:'aTim',title:'Briefing pagi',date:iso(0),type:'Internal',div:'Business Development',updatedAt:now},
    {id:'aUndang',title:'Meeting vendor dekor',date:iso(0),start:'14:00',end:'15:30',type:'Vendor',div:'Business Development',
      owner:'p1',peserta:['p2','p3'],undang:{p2:{at:now-60000},p3:{at:now-60000}},resp:{},updatedAt:now},
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
      if (u.indexOf('account-api')>-1) data={ok:true,members:[{id:'u1',name:'Wandi Pranata'},{id:'u2',name:'Sari Lestari'},{id:'u3',name:'Budi Santoso'}]};
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
const view = () => D.getElementById('view');
const teks = el => (el?el.textContent:'').replace(/\s+/g,' ');
async function simpanServer(){ await tunggu(1100); }

(async () => {
  for(let i=0;i<60 && !(W.__uji && W.__uji.DB && W.__uji.DB.people.length);i++) await tunggu(50);
  await tunggu(300);
  const ev = x => W.__uji.ev(x);
  cek(ev('AKU&&AKU.id')==='p2', 'sesi Sari tercocokkan ke kru p2');

  /* ---------- sidebar ---------- */
  const menu=[...D.querySelectorAll('#nav .nl')].find(b=>/Undangan & Notifikasi/.test(b.textContent));
  cek(!!menu, 'menu "Undangan & Notifikasi" ada di sidebar');
  cek(menu && /Undangan & Notifikasi\s*\d+/.test(menu.textContent), 'menunya berlencana jumlah yang perlu ditangani', menu&&menu.textContent);
  cek(ev("HALAMAN_ALAMAT.indexOf('inbox')>-1"), 'halaman inbox punya alamat (#inbox)');

  /* ---------- dashboard ---------- */
  W.APP.go('dashboard'); await tunggu(30);
  const kol=[...view().querySelectorAll('.days3 .dcol')];
  cek(kol.length===3, 'dashboard punya tiga kolom hari');
  cek(kol.map(k=>k.querySelector('h3').textContent).join('|')==='Hari ini|Besok|Lusa', 'urutannya Hari ini · Besok · Lusa');
  cek(/Briefing pagi/.test(teks(kol[0])) && /Meeting vendor dekor/.test(teks(kol[0])), 'Hari ini memuat agenda tim + undangan untukku');
  cek(!/Rapat purchasing/.test(teks(kol[0])), 'agenda orang lain yang tidak mengundangku TIDAK di kolomku');
  cek(/Kirim proposal sponsor/.test(teks(kol[1])) && !/Task milik Budi/.test(teks(kol[1])), 'Besok memuat tenggat task-ku saja');
  cek(/Sync mingguan/.test(teks(kol[1])), 'agenda yang kuselenggarakan ikut di kolom harinya');
  cek(/Soft launch/.test(teks(kol[2])), 'milestone project-ku di kolom Lusa');
  const pita=teks(view().querySelector('.banner.warn'))+teks(view().querySelector('.banner.bad'));
  cek(/1\s*undangan/.test(pita), 'pita undangan menyebut jumlahnya', pita);
  cek(/1\s*task lewat deadline/.test(pita), 'pita task lewat deadline menyebut jumlahnya');
  cek(/2\s*task menunggu review/.test(teks(view())), 'pita review menyebut 2 task');
  cek(!!D.getElementById('fokusInp'), 'kotak "Fokus utama hari ini" tetap ada');
  const side=teks(view().querySelector('.side3'));
  cek(/Riset kompetitor/.test(side), 'kartu "Belum ada deadline" memuat task tanpa deadline');
  cek(/Menunggu respons/.test(side) && /Meeting vendor dekor/.test(side) && /Desain booth/.test(side), 'kartu "Menunggu respons" memuat undangan & review');

  /* ---------- notifikasi dihitung dari data ---------- */
  const nt=ev('notifSaya()').map(n=>n.k.split(':')[0]);
  cek(nt.indexOf('ag')>-1, 'notifikasi undangan agenda untukku ada');
  cek(nt.indexOf('agr')>-1, 'jawaban peserta atas agendaku jadi notifikasi');
  cek(nt.filter(x=>x==='rv').length===2, 'dua task Review jadi notifikasi "menunggu review"');
  const awalBelum=ev('jumlahBelumDibaca()');
  cek(awalBelum===4, 'empat notifikasi belum dibaca', awalBelum);

  /* ---------- inbox: jawab undangan ---------- */
  W.APP.go('inbox'); await tunggu(30);
  cek(/Undangan agenda/.test(teks(view())) && /Menunggu review kamu/.test(teks(view())), 'tab Perlu respons memuat kedua daftar');
  const tbl=[...view().querySelectorAll('.it.pend')].find(x=>/Meeting vendor dekor/.test(x.textContent));
  const tHadir=tbl&&[...tbl.querySelectorAll('button')].find(b=>b.textContent==='Hadir');
  cek(!!tHadir, 'undangan punya tombol Hadir / Mungkin / Tidak');
  if(tHadir) tHadir.click();
  await simpanServer();
  const aSrv=SERVER.agenda.find(a=>a.id==='aUndang');
  cek(aSrv && aSrv.resp && aSrv.resp.p2 && aSrv.resp.p2.s==='terima', 'jawaban Hadir TERSIMPAN di server', JSON.stringify(aSrv&&aSrv.resp));
  cek(ev('undanganTertunda().length')===0, 'sesudah dijawab undangan tidak ditagih lagi');

  /* ---------- inbox: review ---------- */
  const rv=[...view().querySelectorAll('.it.pend')].find(x=>/Desain booth/.test(x.textContent));
  const bOk=rv&&[...rv.querySelectorAll('button')].find(b=>/Setujui/.test(b.textContent));
  cek(!!bOk, 'task Review punya tombol Setujui & Kembalikan');
  if(bOk) bOk.click();
  await simpanServer();
  const tSrv=SERVER.tasks.find(t=>t.id==='tR');
  cek(tSrv.status==='Done' && tSrv.reviewHasil && tSrv.reviewHasil.s==='ok' && tSrv.reviewHasil.by==='p2', 'Setujui → Done + reviewHasil di server');
  const rv2=[...view().querySelectorAll('.it.pend')].find(x=>/Brief talent/.test(x.textContent));
  const bBalik=rv2&&[...rv2.querySelectorAll('button')].find(b=>/Kembalikan/.test(b.textContent));
  if(bBalik) bBalik.click();
  await simpanServer();
  const t2=SERVER.tasks.find(t=>t.id==='tR2');
  cek(t2.status==='Doing' && t2.reviewHasil && t2.reviewHasil.s==='balik' && /brand/.test(t2.reviewHasil.catatan), 'Kembalikan → Doing + catatan reviewer');
  cek(!t2.reviewAt, 'keluar dari Review membuang reviewAt (masuk lagi = notifikasi baru)');
  cek(ev('reviewTertunda().length')===0, 'tidak ada review yang menunggu lagi');

  /* ---------- inbox: notifikasi & tanda dibaca ---------- */
  W.APP.inboxSet('notif'); await tunggu(20);
  cek(view().querySelectorAll('.nt').length>=2, 'tab Notifikasi menggambar daftarnya');
  W.APP.bacaSemua(); await tunggu(20);
  cek(ev('jumlahBelumDibaca()')===0, 'Tandai semua dibaca → nol belum dibaca');
  cek(view().querySelectorAll('.nt.unread').length===0, 'tidak ada baris unread sesudahnya');
  W.APP.inboxSet('kirim'); await tunggu(20);
  cek(/Sync mingguan/.test(teks(view())), 'tab Undangan saya memuat agenda berpeserta yang kuselenggarakan');

  /* ---------- penugasan & reviewer jadi notifikasi untuk orangnya ---------- */
  W.APP.taskModal(null); await tunggu(20);
  D.getElementById('m_name').value='Task untuk Wandi';
  [...D.querySelectorAll('#m_pics .picchip')].forEach(b=>{ const on=b.getAttribute('data-id')==='p1'; b.classList.toggle('on',on); });
  [...D.querySelectorAll('#m_rev .picchip')].forEach(b=>{ b.classList.toggle('on',b.getAttribute('data-id')==='p3'); });
  W.APP.simpanTask(''); await simpanServer();
  const tb=SERVER.tasks.find(t=>t.name==='Task untuk Wandi');
  cek(tb && tb.tugasOleh && tb.tugasOleh.p1 && tb.tugasOleh.p1.by==='p2', 'PIC baru dicatat tugasOleh {by:p2}', JSON.stringify(tb&&tb.tugasOleh));
  cek(tb && tb.reviewOleh && tb.reviewOleh.p3 && tb.reviewOleh.p3.by==='p2', 'reviewer baru dicatat reviewOleh');
  cek(!(tb.tugasOleh||{}).p2, 'yang menyimpan tidak menugaskan dirinya sendiri');

  /* ---------- agenda baru dengan jam & peserta ---------- */
  W.APP.agendaModal(null, iso(3)); await tunggu(20);
  D.getElementById('a_title').value='Review desain';
  D.getElementById('a_start').value='13:00'; D.getElementById('a_end').value='14:00';
  [...D.querySelectorAll('#a_pes .picchip')].forEach(b=>b.classList.toggle('on',b.getAttribute('data-id')==='p1'));
  W.APP.simpanAgenda(''); await simpanServer();
  const ab=SERVER.agenda.find(a=>a.title==='Review desain');
  cek(ab && ab.owner==='p2' && ab.start==='13:00' && ab.peserta.join()==='p1' && ab.undang.p1, 'agenda baru menyimpan owner, jam, peserta & cap undangan');
  // ubah jam → jawaban lama dibuang
  const sm=W.__uji.DB.agenda.find(a=>a.id==='aMilik');
  W.APP.agendaModal('aMilik'); await tunggu(20);
  D.getElementById('a_start').value='15:00'; D.getElementById('a_end').value='16:00';
  W.APP.simpanAgenda('aMilik'); await simpanServer();
  const am=SERVER.agenda.find(a=>a.id==='aMilik');
  cek(am.start==='15:00' && !(am.resp||{}).p1 && am.undang.p1.ubah, 'jadwal bergeser → jawaban lama dibuang, peserta diminta menjawab ulang');
  W.APP.agendaModal(null, iso(0)); await tunggu(10);
  D.getElementById('a_title').value='Jam terbalik';
  D.getElementById('a_start').value='15:00'; D.getElementById('a_end').value='14:00';
  const nAg=W.__uji.DB.agenda.length; W.APP.simpanAgenda('');
  cek(W.__uji.DB.agenda.length===nAg, 'jam selesai sebelum jam mulai DITOLAK');
  W.closeModal();
  // agenda milik orang lain: Sari tidak bisa membukanya untuk diubah
  W.APP.agendaModal('aLain'); await tunggu(10);
  cek(!D.getElementById('a_title'), 'agenda milik orang lain tidak bisa disunting non-admin');
  W.APP.agendaBuka('aUndang'); await tunggu(10);
  cek(/Peserta/.test(teks(D.getElementById('modal'))) && /Jawabanmu/.test(teks(D.getElementById('modal'))), 'detail agenda menampilkan peserta & jawabanku');
  W.closeModal();

  /* ---------- calendar ---------- */
  W.APP.go('calendar'); await tunggu(20);
  cek(ev("CAL.mode")==='minggu', 'bawaannya mode Minggu');
  cek(view().querySelectorAll('.vg .vg-c').length===7, 'Minggu = grid jam tujuh kolom');
  W.APP.calSet({date:iso(0),mode:'hari'}); await tunggu(20);
  const blk=[...view().querySelectorAll('.vg .blk')].map(b=>b.textContent);
  cek(blk.some(t=>/Meeting vendor dekor/.test(t)), 'agenda berjam digambar sebagai blok di grid', blk.join('|'));
  cek(/Briefing pagi/.test(teks(view().querySelector('.vg-a'))), 'agenda tanpa jam di baris "tanpa jam"');
  cek(!blk.some(t=>/Rapat purchasing/.test(t)), 'kalender saya tidak memuat agenda orang lain');
  W.APP.calSet({scope:'semua'}); await tunggu(20);
  cek([...view().querySelectorAll('.vg .blk')].some(b=>/Rapat purchasing/.test(b.textContent)), 'lingkup Seluruh tim memuatnya');
  W.APP.calSet({scope:'u:p3',mode:'daftar'}); await tunggu(20);
  cek(/Task milik Budi/.test(teks(view())) && /Rapat purchasing/.test(teks(view())) && !/Kirim proposal sponsor/.test(teks(view())), 'lingkup satu orang (Budi) di mode Daftar');
  W.APP.calSet({scope:'d:Business Development',mode:'minggu'}); await tunggu(20);
  const tab=view().querySelector('table.kalorang');
  cek(!!tab && /Wandi Pranata/.test(teks(tab)) && /Sari Lestari/.test(teks(tab)) && !/Budi Santoso/.test(teks(tab)), 'divisi × minggu = satu baris per kru divisi itu');
  W.APP.calSet({scope:'saya',mode:'bulan'}); await tunggu(20);
  cek(view().querySelectorAll('.cal .cd').length>=28, 'mode Bulan menggambar kotak tanggal');
  const geser=view().querySelector('.kchip.geser');
  cek(!!geser, 'deadline task di mode Bulan bisa diseret');
  W.APP.calToggle('deadline'); await tunggu(20);
  cek(!view().querySelector('.kchip.geser'), 'chip "Deadline task" dimatikan → deadline hilang dari kalender');
  W.APP.calToggle('deadline');
  W.APP.calNav(1); await tunggu(10);
  const d1=new Date(); d1.setMonth(d1.getMonth()+1,1);
  cek(ev('CAL.date').slice(0,7)===d1.getFullYear()+'-'+String(d1.getMonth()+1).padStart(2,'0'), 'panah berikutnya di mode Bulan maju satu bulan');

  selesai();
})().catch(e=>{ console.log('GAGAL uji melempar: '+e.stack); gagal++; selesai(); });
