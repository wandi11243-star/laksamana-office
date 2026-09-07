/* performa-bonus.js — MESIN BONUS PERFORMA MARKETING & EVENT, SUMBER TUNGGAL.
 *
 * Dipakai bersama oleh:
 *   deploy/finance/kas/      Performa Marketing & Performa Event (asalnya)
 *   deploy/marketing/        Performa Marketing
 *   deploy/event/            Performa Event
 *
 * KENAPA BERKAS SENDIRI. Sampai 7 September 2026 seluruh isi berkas ini hidup
 * inline di deploy/finance/kas/. Begitu user meminta halaman yang sama muncul
 * di modul Marketing dan Event, satu-satunya pilihan lain adalah MENYALINNYA —
 * dan itu akan membuat TIGA salinan rumus uang yang sama. Repo ini sudah
 * kehilangan waktu empat kali karena berkas kembar yang tertinggal: porsiPic,
 * potonganHari, hpp.php, dan cocokPic. Pola yang sama dengan
 * deploy/assets/venue-layouts.js dan deploy/assets/xlsx-baca.js.
 *
 * MANDIRI, tidak bergantung pada satu pun nama global tuan rumah. Pemformatnya
 * (PB_RP/PB_NUM/PB_ESC) disalin dari deploy/finance/kas/ dan sengaja bernama
 * sendiri: modul Marketing memakai rp() bukan fmtRp(), modul Event punya esc()
 * sendiri, dan aset yang menumpang nama global akan memakai pemformat yang
 * BERBEDA di tiap modul tanpa satu pun galat. Yang disalin cuma pemformat —
 * tidak satu pun rumus uang.
 *
 * Satu-satunya yang WAJIB diberikan tuan rumah: peta Tim/Keterangan Office,
 * lewat pbSetKeterangan(fn). Tanpa itu PB_KET memulangkan null untuk semua
 * orang, dan itu keadaan yang SAH: tidak ada yang dianggap leader maupun head
 * — menebaknya berarti memberi bonus leader kepada orang yang tidak pernah
 * ditunjuk, dan membuka daftar tim kepada yang belum tentu berhak.
 *
 *   node tools/uji-bonus-marketing.js
 *   node tools/uji-bonus-event.js
 */
'use strict';
/* SELURUH isi berkas ini di dalam SATU pembungkus. fmtRp/num/esc di bawah
   bernama SAMA dengan milik tuan rumah, dan dua const bernama sama di lingkup
   global skrip klasik membuat halamannya mati dengan SyntaxError sebelum satu
   baris pun sempat jalan. Yang dipakai tuan rumah diekspor ke window di kaki
   berkas ini. */
(function(){
const fmtRp=n=>'Rp'+Math.round(n||0).toLocaleString('id-ID');
const num=v=>{const n=parseInt(String(v).replace(/[^0-9-]/g,''),10);return isNaN(n)?0:n;};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PB_RP=fmtRp, PB_NUM=num, PB_ESC=esc;
/* Peta Tim/Keterangan dari Office. Diisi tuan rumah; lihat catatan di kepala. */
let PB_KET=function(){ return null; };
function pbSetKeterangan(fn){ PB_KET=(typeof fn==='function')?fn:function(){ return null; }; }
/* ============ BONUS MARKETING ============
   Skema SDM "Skema Target & Bonus — Tim Marketing", dipasang 7 September 2026
   atas permintaan user. EMPAT skema, dan pemisahan tunai/non-tunai bukan
   kosmetik:

     Skema 1  Bonus Target        pool TIM dari event corporate, dibagi per PIC
     Skema 2  Tangga per PIC      dari total nilai deal PIC itu sebulan
     Skema 3  Total Omset Team    dari omset seluruh tim; leader beda nominal
     Skema 4  Non-Tunai           voucher F&B, cuti tambahan, penghargaan

   SKEMA 1+2+3 DIAKUMULASI jadi satu angka rupiah; SKEMA 4 BERDIRI SENDIRI
   (permintaan user). Menjumlahkan voucher F&B dan hari cuti ke rupiah bonus
   membuat angka yang TIDAK BISA DICAIRKAN tampak seperti uang yang bisa, dan
   yang menyiapkan pembayarannya tidak punya satu pun cara membedakannya lagi.

   DASAR ANGKANYA "DIAKUI" — omset + tax + service, yaitu kolom Diakui di
   Daftar Event dan kartu Realisasi di halaman ini (keputusan user 7 September
   2026), bukan omset polos. Per PIC dasarnya `real`, yang SUDAH dipotong
   compliment: compliment mengurangi omset yang diakui, jadi ia harus ikut
   mengurangi tangga bonusnya — kalau tidak, kartu Realisasi dan kartu bonus di
   layar yang sama bercerita lain tentang bulan yang sama.

   Batas atas TIDAK dipatok di mana pun, alasan yang sama dengan BONUS_KASIR:
   omset di atas baris teratas tetap berhak atas tangga tertinggi.

   Seluruh nominal ditulis PENUH, bukan "20 jt" (permintaan user) — dan bukan
   cuma di layar: yang mengubah angkanya harus mengubah angka yang sama persis
   dengan yang dibacanya, kalau tidak "50" bisa berarti lima puluh juta di satu
   baris dan lima puluh ribu di baris berikutnya. */

/* ---- SKEMA 1 — Bonus Target (tim) ---- */
const MK_S1_MIN_EVENT=20000000;      // "Minimal Rp 20 Juta / event"
/* Tangga JUMLAH event corporate yang nilainya >= MK_S1_MIN_EVENT. AMBIL YANG
   TERTINGGI SAJA (keputusan user 7 September 2026): tim yang punya 10 event
   tidak juga menerima bonus baris 5 event — dokumennya berbunyi "salah satu
   dari target berikut". */
const MK_S1_JUMLAH=[
  { min:10, bonus:2000000 },
  { min: 5, bonus: 500000 },
];
/* Butir ketiga & keempat dokumen berbunyi "per event", jadi dihitung PER EVENT
   dan boleh berulang — sepuluh event >= Rp30.000.000 memberi sepuluh kali
   Rp300.000. Tiap event tetap dihitung SEKALI, di tangga tertingginya: event
   Rp75.000.000 memberi Rp500.000, BUKAN Rp500.000 + Rp300.000. Kalau berlipat,
   yang menerimanya dibayar dua kali untuk satu acara dan selisihnya tidak
   pernah muncul sebagai galat. */
const MK_S1_EVENT=[
  { min:70000000, bonus:500000 },
  { min:30000000, bonus:300000 },
];

/* ---- SKEMA 2 — tangga per PIC ----
   TANGGA DI DOKUMEN PUNYA CELAH DAN TUMPANG TINDIH. Keduanya diputuskan DI
   SINI, satu tempat, bukan dibiarkan jadi selisih yang baru ketahuan waktu
   bonusnya dibayarkan:

     tumpang tindih  "Rp120–150 jt" (Rp250.000) vs "Rp150–200 jt" (Rp500.000):
                     tepat Rp150.000.000 diberi yang LEBIH BESAR.
     celah           "Rp150–200 jt" lalu langsung "Rp201–250 jt" —
                     Rp200.000.001 s/d Rp201.000.000 tidak disebut satu baris
                     pun; dimasukkan ke tangga DI ATASNYA (Rp750.000).

   Keduanya diputuskan MEMIHAK PIC, dan itu bukan kemurahan hati: tangga yang
   berlubang membuat omset yang NAIK bisa menurunkan bonus, dan tidak ada
   seorang pun yang bisa menjelaskan itu kepada yang menerimanya.

   Yang ditulis di kolom Syarat pada tabel di layar adalah `min` INI, bukan
   kalimat dokumennya — supaya yang dibaca sama persis dengan yang dihitung. */
const MK_S2=[
  { min:350000001, bonus:1500000, label:'Di atas Rp350.000.000' },
  { min:300000001, bonus:1250000, label:'Rp300.000.001 – Rp350.000.000' },
  { min:250000001, bonus:1000000, label:'Rp250.000.001 – Rp300.000.000' },
  { min:200000001, bonus: 750000, label:'Rp200.000.001 – Rp250.000.000' },
  { min:150000000, bonus: 500000, label:'Rp150.000.000 – Rp200.000.000' },
  { min:120000000, bonus: 250000, label:'Rp120.000.000 – Rp149.999.999' },
];

/* ---- SKEMA 3 — total omset TIM ----
   Batasnya bersentuhan di dokumen (…–350, 350–400, …); yang tepat di batas
   diberi tangga yang LEBIH BESAR, alasan sama dengan Skema 2.

   "Rp 4.00.0000" di dokumen jelas salah ketik — deretnya Rp500.000, Rp1 juta,
   Rp2 juta, Rp3 juta, jadi baris terakhirnya Rp4.000.000. Ditulis penuh di
   sini supaya tidak pernah lagi harus ditebak siapa pun. */
const MK_S3=[
  { min:500000001, leader:4000000, tim:1750000, label:'Di atas Rp500.000.000' },
  { min:450000000, leader:3000000, tim:1500000, label:'Rp450.000.000 – Rp500.000.000' },
  { min:400000000, leader:2000000, tim:1250000, label:'Rp400.000.000 – Rp450.000.000' },
  { min:350000000, leader:1000000, tim: 750000, label:'Rp350.000.000 – Rp400.000.000' },
  { min:300000000, leader: 500000, tim: 250000, label:'Rp300.000.000 – Rp350.000.000' },
];

/* ---- SKEMA 4 — non-tunai ----
   Voucher dihitung PER EVENT, dan tiap event dihitung SEKALI di tangga
   tertingginya — aturan yang sama dengan MK_S1_EVENT.

   "Di atas Rp X" dibaca SAMA DENGAN "minimal Rp X" di seluruh berkas ini
   (perbandingannya >=). Dokumen memakai dua kata untuk ambang yang sama
   (Skema 1 "Minimal Rp 20 Juta", Skema 4 "di atas Rp 20 juta"), dan dua aturan
   untuk satu angka berarti event bernilai tepat Rp20.000.000 lolos di satu
   skema dan gugur di skema sebelahnya — selisih yang mustahil dijelaskan dari
   layar mana pun. */
const MK_S4_VOUCHER=[
  { min:56000000, nilai:200000 },
  { min:20000000, nilai:100000 },
];
const MK_S4_CUTI_MIN=50000000;   // "events besar di atas Rp 50 juta"
const MK_S4_CUTI_PER=3;          // tiap 3 event besar = 1 hari cuti
const MK_S4_TOP=350000000;       // "Top Marketer of the Month"

function mkTangga(tab,nilai){ return tab.find(t=>nilai>=t.min)||null; }
/* Jenisnya dicocokkan LONGGAR ("mengandung kata corporate") karena yang
   tersimpan teks EVENT_TYPES modul Marketing — 'Corporate Event'. Yang TIDAK
   punya jenis sama sekali bukan corporate dan TIDAK ditebak: baris manual yang
   diketik finance dan Reservasi VIP memang tidak punya jenis, dan menjatuhkan
   keduanya ke corporate berarti membayar bonus atas acara yang tidak pernah
   memenuhi syaratnya. Jumlahnya dilaporkan di kartu Skema 1. */
function mkCorporate(ev){ return /corporate/i.test(String(ev.jenis||'')); }
function bonusS2(nilai){
  const t=mkTangga(MK_S2,nilai);
  if(t) return Object.assign({},t,{ next:MK_S2[MK_S2.indexOf(t)-1]||null });
  return { min:0, bonus:0, label:'Belum masuk tangga', next:MK_S2[MK_S2.length-1] };
}
/* SATU KATA UNTUK DUA HAL: "Head" di kolom Tim/Keterangan Office (keputusan
   user 7 September 2026), ditulis di samping "Marketing".

   Sempat dua kata yang berbeda: "Leader" menentukan Bonus Leader (Skema 3),
   sementara "Head" direncanakan menentukan siapa yang boleh melihat seluruh
   tim. Dua penanda untuk satu jabatan yang sama pasti menyimpang — orang yang
   ditandai Leader saja akan menerima bonusnya tapi tidak bisa membuka daftar
   timnya, dan tidak ada satu pun layar yang bisa menjelaskan kenapa. User
   memutuskan menyatukannya ke "Head".

   KOLOMNYA TETAP BERNAMA "Bonus Leader" — itu nama di dokumen SDM-nya, dan
   mengganti nama baris bonus membuat layar ini berhenti bisa dicocokkan dengan
   dokumen yang dipegang orang. Yang berubah PENANDANYA di Office, bukan nama
   bonusnya.

   KATA "Leader" TIDAK LAGI DIKENALI. Yang keterangannya sudah terlanjur
   ditulis "Leader" akan terbaca sebagai BUKAN head — dan itu dikatakan
   terang-terangan di kartunya ("tambahkan kata Head"), bukan didiamkan. Dua
   kata yang sama-sama berlaku justru mengembalikan masalah yang baru saja
   ditutup.

   Sengaja TIDAK ada setelan terpisah di modul ini. Setelan kedua untuk fakta
   yang sudah tercatat di Office pasti menyimpang darinya suatu hari — dan yang
   menyimpang di sini selisihnya sampai Rp2.250.000 sebulan untuk satu orang.

   Kalau Office belum menjawab, PB_KET() memulangkan null dan TIDAK SEORANG
   PUN dianggap head; menebaknya berarti memberi bonus leader kepada orang yang
   tidak pernah ditunjuk — dan, begitu hak lihat ikut memakainya, membuka
   daftar tim kepada yang belum tentu berhak. Kosong maupun lebih dari satu
   DIKATAKAN di kartunya berikut cara membetulkannya. */
function pbHead(e){
  const k=PB_KET(e);
  if(k===null) return false;
  /* Kata UTUH, bukan potongan: "Overhead" dan "Headhunter" tidak boleh membuat
     orang jadi head. Pemisahnya sama dengan seluruh modul (spasi, koma, titik
     koma, garis miring), jadi "Marketing, Head" dan "Marketing/Head" sama-sama
     terbaca. */
  return String(k).toLowerCase().split(/[\s,;/]+/).some(t=>t==='head');
}

/* SATU tempat yang menghitung SELURUH skema, dari `agg` yang sama persis
   dengan yang menggambar tabel Daftar Event di halaman ini. Dua tempat yang
   menghitung bonus sendiri-sendiri akan berselisih suatu hari, dan yang
   selisih itu uang — pelajaran yang di repo ini sudah dibayar dua kali lewat
   porsiPic dan potonganHari. */
function bonusMarketing(list, agg){
  const evSemua=[]; const aktif=[]; let tanpaJenis=0;
  list.forEach(e=>{
    const a=agg[e.id]; if(!a) return;
    if(a.events.length) aktif.push(e.id);
    a.events.forEach(ev=>{ evSemua.push(ev); if(!String(ev.jenis||'').trim()) tanpaJenis++; });
  });
  const corp=evSemua.filter(mkCorporate);

  /* --- SKEMA 1 --- */
  const s1lolos=corp.filter(ev=>ev.porsi>=MK_S1_MIN_EVENT);
  const s1jum=mkTangga(MK_S1_JUMLAH,s1lolos.length);
  const s1ev=[];
  corp.forEach(ev=>{ const t=mkTangga(MK_S1_EVENT,ev.porsi); if(t) s1ev.push({ev:ev,t:t}); });
  const s1pool=(s1jum?s1jum.bonus:0)+s1ev.reduce((s,x)=>s+x.t.bonus,0);
  /* Pembaginya PIC YANG PUNYA EVENT bulan itu (keputusan user), bukan seluruh
     roster. Roster ini tumbuh sendiri dari Tim/Keterangan Office dan rutin
     menyimpan nama yang sudah pindah tim; dibagi ke seluruh roster, satu baris
     yang tertinggal di sana mengecilkan bonus SEMUA orang tanpa satu pun tanda
     di layar mana pun. Pembaginya karena itu selalu disebut angkanya. */
  const s1bagi=aktif.length;
  const s1per=s1bagi?Math.floor(s1pool/s1bagi):0;

  /* --- SKEMA 3 --- */
  const totTim=list.reduce((s,e)=>s+((agg[e.id]&&agg[e.id].real)||0),0);
  const s3=mkTangga(MK_S3,totTim);
  const headIds=list.filter(pbHead).map(e=>e.id);
  /* DIBEDAKAN dari "tidak ada yang bertanda Head". Kalau Office belum
     menjawab, PB_KET() memulangkan null untuk SEMUA orang dan headIds
     kosong — persis sama bentuknya dengan tim yang memang belum menunjuk
     head. Kalimat "tambahkan kata Head di Office" untuk keadaan itu
     menyuruh orang membetulkan sesuatu yang sudah benar, dan yang menurutinya
     akan menambahkan penanda kedua pada orang yang sudah punya.
     Dibaca lewat PB_KET(), bukan KET_MAP langsung, supaya satu-satunya
     pembaca peta itu tetap satu. */
  const ketAda=list.some(e=>PB_KET(e)!==null);

  /* --- per PIC --- */
  const per={};
  list.forEach(e=>{
    const a=agg[e.id]||{real:0,events:[]};
    const ikutS1=aktif.indexOf(e.id)>-1;
    const s1=ikutS1?s1per:0;
    const s2=bonusS2(a.real);
    const isHead=headIds.indexOf(e.id)>-1;
    const s3n=s3?(isHead?s3.leader:s3.tim):0;
    let voucher=0; const vJml={};
    (a.events||[]).forEach(ev=>{
      const t=mkTangga(MK_S4_VOUCHER,ev.porsi);
      if(t){ voucher+=t.nilai; vJml[t.min]=(vJml[t.min]||0)+1; }
    });
    const evBesar=(a.events||[]).filter(ev=>ev.porsi>=MK_S4_CUTI_MIN).length;
    per[e.id]={ s1:s1, ikutS1:ikutS1, s2:s2, s3:s3n, isHead:isHead,
      tunai:s1+s2.bonus+s3n,
      voucher:voucher, vJml:vJml, evBesar:evBesar,
      cuti:Math.floor(evBesar/MK_S4_CUTI_PER), top:a.real>=MK_S4_TOP };
  });
  return { per:per, headIds:headIds, ketAda:ketAda, tanpaJenis:tanpaJenis,
    jumPic:list.length,
    jumEvent:evSemua.length, corp:corp,
    s1:{ lolos:s1lolos, jum:s1jum, ev:s1ev, pool:s1pool, bagi:s1bagi, perPic:s1per },
    s3:{ tier:s3, total:totTim },
    tunaiSemua:list.reduce((s,e)=>s+per[e.id].tunai,0),
    voucherSemua:list.reduce((s,e)=>s+per[e.id].voucher,0),
    cutiSemua:list.reduce((s,e)=>s+per[e.id].cuti,0),
    topSemua:list.filter(e=>per[e.id].top).map(e=>e.name) };
}

/* ---- PENGGAMBAR KARTU BONUS MARKETING ----
   Bentuknya sengaja MENIRU Performa Kasir (permintaan user): satu baris tiga
   kotak stat di atas — posisi sekarang — lalu tangganya sebagai tabel di
   bawah. Yang mengecek bonusnya di dua halaman ini melihat susunan yang sama,
   jadi tidak perlu belajar dua cara membaca angka yang sama. */
const MK_HI=' style="background:var(--gold-soft)"';

/* Baris ringkas, sepadan dengan baguRingkasKasir di Performa Kasir. Tunai dan non-tunai
   DIPISAH di dua kotak yang berbeda — satu kotak berisi "Rp1.750.000 + 2 hari
   cuti" adalah angka yang tidak bisa dipakai untuk apa pun. */
function baguRingkasMk(info, pid, e, a){
  const semua=pid==='__all__';
  const p=semua?null:info.per[pid];
  const tunai=semua?info.tunaiSemua:(p?p.tunai:0);
  const voucher=semua?info.voucherSemua:(p?p.voucher:0);
  const cuti=semua?info.cutiSemua:(p?p.cuti:0);
  const rinci=semua
    ? `jumlah bonus tunai ${info.jumPic} PIC di roster marketing`
    : (p?`Skema 1 ${PB_RP(p.s1)} · 2 ${PB_RP(p.s2.bonus)} · 3 ${PB_RP(p.s3)}`:'—');
  /* Kotak tengah menjawab pertanyaan yang paling sering dibawa orang ke
     halaman ini — "kurang berapa lagi" — dan itu cuma bisa dijawab per orang.
     Pada segmen Semua ia diganti angka tim: tangga Skema 2 dihitung dari omset
     SATU PIC, jadi menerapkannya ke angka gabungan memberi tangga yang tidak
     akan pernah diterima siapa pun. */
  const tengah=semua
    ? `<div class="stat"><div class="lab">Omset Tim (Skema 3)</div><div class="val sm mono">${PB_RP(info.s3.total)}</div>
        <div class="foot">${info.s3.tier?PB_ESC(info.s3.tier.label):'belum masuk tangga Skema 3'}</div></div>`
    : (function(){
        const s2=p.s2, kurang=s2.next?Math.max(0,s2.next.min-a.real):0;
        return `<div class="stat"><div class="lab">${s2.next?'Menuju Tangga Skema 2':'Tangga Skema 2 Tertinggi'}</div>
          <div class="val sm mono">${s2.next?PB_RP(kurang):'—'}</div>
          <div class="foot">${s2.next?`lagi untuk bonus ${PB_RP(s2.next.bonus)}`:'sudah di tangga teratas'}</div></div>`;
      })();
  return `<div class="grid g3">
    <div class="stat ${tunai?'accent':''}"><div class="lab">Bonus Tunai${semua?' — Seluruh Tim':''}</div>
      <div class="val sm mono">${PB_RP(tunai)}</div><div class="foot">${PB_ESC(rinci)}</div></div>
    ${tengah}
    <div class="stat"><div class="lab">Non-Tunai (Skema 4)</div>
      <div class="val sm mono">${voucher?PB_RP(voucher):'—'}</div>
      <div class="foot">voucher F&amp;B${cuti?` · ${cuti} hari cuti`:''}${(!voucher&&!cuti)?' · belum ada':''}</div></div>
  </div>`;
}

/* Kolom Realisasi di tabel tangga (7 September 2026, permintaan user). Tangga
   tanpa angka capaian di sebelahnya memaksa orang menghitung sendiri sudah di
   baris mana ia berdiri dan kurang berapa lagi — padahal justru itu dua-duanya
   satu-satunya pertanyaan yang dibawa orang ke tabel semacam ini.

   ISINYA BEDA PER BARIS, dan bedanya disengaja:

     baris yang sedang berlaku  -> ANGKA realisasinya, tebal
     baris di atasnya           -> kurang berapa lagi untuk sampai ke sana
     baris yang sudah terlewati -> ditandai terlampaui, bukan diulang angkanya

   Kalau seluruh baris memajang angka yang sama, kolomnya berhenti berarti apa
   pun dan yang membacanya tetap harus menghitung selisihnya sendiri — persis
   pekerjaan yang kolom ini ada untuk menghapusnya.

   `nilai` null berarti tangga itu TIDAK sedang menilai satu orang (segmen
   Semua PIC pada tangga per PIC). Memajang angka gabungan di sana berarti
   menjanjikan bonus yang tidak akan pernah diterima siapa pun. */
function selRealisasi(nilai, min, aktif){
  if(nilai===null||nilai===undefined) return '<td class="num mono"><span class="muted">—</span></td>';
  if(aktif) return `<td class="num mono"><b>${PB_RP(nilai)}</b> ✓</td>`;
  if(nilai>=min) return '<td class="num mono"><span class="muted">terlampaui</span></td>';
  return `<td class="num mono"><span class="muted">kurang ${PB_RP(min-nilai)}</span></td>`;
}
function kartuSkema1(info){
  const s1=info.s1;
  const perTangga=m=>s1.ev.filter(x=>x.t.min===m).length;
  const barisJumlah=MK_S1_JUMLAH.map(t=>{
    const aktif=!!(s1.jum&&s1.jum.min===t.min);
    return `<tr${aktif?MK_HI:''}>
      <td>Tim mencapai <b>${t.min} event corporate</b> senilai ≥ ${PB_RP(MK_S1_MIN_EVENT)}</td>
      <td class="num mono">${s1.lolos.length} event</td>
      <td class="num mono">${PB_RP(t.bonus)}</td>
      <td class="num mono">${aktif?'<b>'+PB_RP(t.bonus)+'</b> ✓':'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const barisEvent=MK_S1_EVENT.map(t=>{
    const n=perTangga(t.min);
    return `<tr${n?MK_HI:''}>
      <td>Tiap event corporate senilai ≥ ${PB_RP(t.min)}</td>
      <td class="num mono">${n} event</td>
      <td class="num mono">${PB_RP(t.bonus)} <span class="muted">/ event</span></td>
      <td class="num mono">${n?'<b>'+PB_RP(t.bonus*n)+'</b> ✓':'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  /* Baris yang tidak punya jenis DIKATAKAN, bukan didiamkan. Jenis event baru
     ikut tercatat di Breakdown sejak 7 September 2026; bulan-bulan sebelumnya
     kosong sampai tanggalnya dibuka sekali di Breakdown Sumber — dan pool yang
     lebih kecil daripada seharusnya tetap kelihatan wajar di layar. */
  const catatanJenis=info.tanpaJenis
    ? `<div class="notice warn"><div>${info.tanpaJenis} dari ${info.jumEvent} event <b>belum punya jenis</b>, jadi tidak dihitung sebagai corporate.
        Baris manual yang diketik finance dan Reservasi VIP memang tidak punya jenis dan itu benar.
        Tapi event dari modul Marketing yang breakdown-nya tersimpan <b>sebelum 7 September 2026</b> juga masih kosong —
        buka <b>Omset → Breakdown Sumber</b> sekali pada tanggal-tanggal itu supaya jenisnya tersegar dari modul Marketing.</div></div>`
    : '';
  return `<div class="card">
    <h3>1️⃣ Skema 1 — Bonus Target Tim</h3>
    <div class="card-sub">Pool dihitung dari <b>event corporate seluruh tim</b>, lalu dibagi rata ke PIC yang punya event pada periode ini.
      Nilai tiap event memakai kolom <b>Diakui</b> (omset + tax + service).</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Syarat</th><th class="num">Tercapai</th><th class="num">Bonus</th><th class="num">Diperoleh</th></tr></thead>
      <tbody>${barisJumlah}${barisEvent}</tbody>
      <tfoot><tr><th colspan="3">Pool tim</th><th class="num mono">${PB_RP(s1.pool)}</th></tr>
        <tr><th colspan="3">Dibagi ke ${s1.bagi} PIC yang punya event periode ini</th>
          <th class="num mono">${PB_RP(s1.perPic)} <span class="muted">/ PIC</span></th></tr></tfoot>
    </table></div>
    <div class="helper" style="margin-top:10px">Dua baris pertama <b>tidak berlipat</b> — yang berlaku hanya yang tertinggi.
      Dua baris terakhir dihitung per event dan boleh berulang; tiap event dihitung sekali, di tangga tertingginya.</div>
    ${catatanJenis}
  </div>`;
}

function kartuSkema2(info, pid, a){
  const semua=pid==='__all__';
  const s2=semua?null:info.per[pid].s2;
  // Segmen Semua tidak menilai satu orang — lihat selRealisasi().
  const real=semua?null:a.real;
  const baris=MK_S2.slice().reverse().map(t=>{
    const aktif=!!(s2&&s2.bonus&&s2.min===t.min);
    return `<tr${aktif?MK_HI:''}><td>${aktif?'<b>'+PB_ESC(t.label)+'</b> ✓':PB_ESC(t.label)}</td>
      ${selRealisasi(real,t.min,aktif)}
      <td class="num mono">${aktif?'<b>'+PB_RP(t.bonus)+'</b>':PB_RP(t.bonus)}</td></tr>`;
  }).join('');
  const bawah=(s2&&!s2.bonus)?MK_HI:'';
  return `<div class="card">
    <h3>2️⃣ Skema 2 — Tangga Total Nilai Deal per PIC</h3>
    <div class="card-sub">Dasarnya <b>Realisasi PIC itu sendiri</b> pada periode ini — seluruh event yang diakui untuknya, sudah dipotong compliment.
      ${semua?'<b>Dinilai per PIC</b>; angka gabungan tidak dipakai di sini, pilih namanya di atas.':`Realisasi ${PB_ESC(PB_RP(a.real))}.`}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Total Nilai Deal / Bulan</th><th class="num">Realisasi</th><th class="num">Bonus untuk Marketing</th></tr></thead>
      <tbody>
        <tr${bawah}><td>${bawah?'<b>Di bawah '+PB_RP(120000000)+'</b> ✓':'Di bawah '+PB_RP(120000000)}</td>${selRealisasi(real,0,!!bawah)}<td class="num mono">—</td></tr>
        ${baris}
      </tbody></table></div>
    <div class="helper" style="margin-top:10px">Dihitung berdasarkan PIC yang menghandle event corporate — tangganya sendiri memakai <b>seluruh event</b> PIC itu (keputusan user 7 September 2026).</div>
  </div>`;
}

function kartuSkema3(info, list, pid){
  const tier=info.s3.tier;
  const baris=MK_S3.slice().reverse().map(t=>{
    const aktif=!!(tier&&tier.min===t.min);
    return `<tr${aktif?MK_HI:''}><td>${aktif?'<b>'+PB_ESC(t.label)+'</b> ✓':PB_ESC(t.label)}</td>
      ${selRealisasi(info.s3.total,t.min,aktif)}
      <td class="num mono">${aktif?'<b>'+PB_RP(t.leader)+'</b>':PB_RP(t.leader)}</td>
      <td class="num mono">${aktif?'<b>'+PB_RP(t.tim)+'</b>':PB_RP(t.tim)}</td></tr>`;
  }).join('');
  /* Siapa leadernya DIKATAKAN — termasuk waktu tidak ada, dan termasuk waktu
     lebih dari satu. Bonus leader dan bonus anggota berbeda sampai
     Rp2.250.000 sebulan, jadi kartu yang diam tentang siapa yang dianggap
     leader menyembunyikan tepat angka yang paling perlu diperiksa. */
  const nama=info.headIds.map(id=>(list.find(x=>x.id===id)||{}).name).filter(Boolean);
  let pitaLeader;
  if(!nama.length && !info.ketAda) pitaLeader=`<div class="notice warn"><div><b>Tim/Keterangan dari Office belum termuat</b>, jadi Head belum bisa ditentukan dan seluruh PIC sementara dihitung memakai kolom <b>Bonus Team Marketing</b>. Muat ulang halaman; kalau tetap begini, Office-nya yang belum menjawab.</div></div>`;
  else if(!nama.length) pitaLeader=`<div class="notice warn"><div><b>Head belum ditentukan</b>, jadi seluruh PIC dihitung memakai kolom <b>Bonus Team Marketing</b>.
      Tentukan lewat Office: tambahkan kata <b>Head</b> pada kolom <b>Tim/Keterangan</b> orangnya, di samping <b>Marketing</b>.
      <br><span style="opacity:.9;font-size:11px">Kata yang dicari <b>Head</b>, bukan "Leader" — kalau keterangannya sudah terlanjur ditulis Leader, gantilah.</span></div></div>`;
  else if(nama.length>1) pitaLeader=`<div class="notice warn"><div><b>${nama.length} orang</b> tercatat sebagai <b>Head</b> (${PB_ESC(nama.join(', '))}), dan semuanya menerima Bonus Leader.
      Kalau itu tidak disengaja, hapus kata <b>Head</b> pada kolom Tim/Keterangan yang tidak seharusnya di Office.</div></div>`;
  else pitaLeader=`<div class="helper" style="margin-top:10px">Head: <b>${PB_ESC(nama[0])}</b> — dari kata <b>Head</b> di kolom Tim/Keterangan Office. PIC lain memakai kolom Bonus Team Marketing.</div>`;
  return `<div class="card">
    <h3>3️⃣ Skema 3 — Bonus Total Omset Team</h3>
    <div class="card-sub">Dasarnya <b>omset seluruh tim marketing</b> pada periode ini: ${PB_RP(info.s3.total)}${
      tier?` — masuk ${PB_ESC(tier.label)}`:' — belum masuk tangga mana pun'}.
      Sama untuk <b>seluruh PIC di roster</b>, termasuk yang periode ini belum punya event: yang dinilai capaian TIM, bukan capaian orangnya. Yang membedakan hanya leader.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Total Nilai Deal / Bulan</th><th class="num">Realisasi Tim</th><th class="num">Bonus Leader</th><th class="num">Bonus Team Marketing</th></tr></thead>
      <tbody><tr${tier?'':MK_HI}><td>${tier?'Di bawah '+PB_RP(300000000):'<b>Di bawah '+PB_RP(300000000)+'</b> ✓'}</td>
        ${selRealisasi(info.s3.total,0,!tier)}<td class="num mono">—</td><td class="num mono">—</td></tr>${baris}</tbody></table></div>
    ${pitaLeader}
  </div>`;
}

function kartuSkema4(info, pid, list){
  const semua=pid==='__all__';
  const p=semua?null:info.per[pid];
  const jml=m=>semua?list.reduce((s,e)=>s+((info.per[e.id].vJml[m])||0),0):((p.vJml[m])||0);
  const voucher=MK_S4_VOUCHER.map(t=>{
    const n=jml(t.min);
    return `<tr${n?MK_HI:''}><td>Voucher F&amp;B ${PB_RP(t.nilai)} untuk tiap event ≥ ${PB_RP(t.min)}</td>
      <td class="num mono">${n} event</td>
      <td class="num mono">${n?'<b>'+PB_RP(t.nilai*n)+'</b> ✓':'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const evBesar=semua?list.reduce((s,e)=>s+info.per[e.id].evBesar,0):p.evBesar;
  const cuti=semua?info.cutiSemua:p.cuti;
  const top=semua?info.topSemua:(p.top?['ya']:[]);
  const topTeks=semua
    ? (info.topSemua.length?'<b>'+PB_ESC(info.topSemua.join(', '))+'</b> ✓':'<span class="muted">belum ada</span>')
    : (p.top?'<b>Tercapai</b> ✓':'<span class="muted">belum</span>');
  return `<div class="card">
    <h3>4️⃣ Skema 4 — Bonus Non-Tunai (insentif tambahan)</h3>
    <div class="card-sub">Voucher, cuti, dan penghargaan — <b>tidak dijumlahkan</b> ke Bonus Tunai di atas.
      Nilainya rupiah, tapi yang keluar bukan uang: menjumlahkannya membuat angka yang tidak bisa dicairkan tampak seperti yang bisa.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Insentif</th><th class="num">Tercapai</th><th class="num">Diperoleh</th></tr></thead>
      <tbody>
        ${voucher}
        <tr${cuti?MK_HI:''}><td>1 hari cuti tambahan tiap ${MK_S4_CUTI_PER} event ≥ ${PB_RP(MK_S4_CUTI_MIN)} dalam 1 bulan</td>
          <td class="num mono">${evBesar} event</td>
          <td class="num mono">${cuti?'<b>'+cuti+' hari</b> ✓':'<span class="muted">—</span>'}</td></tr>
        <tr${top.length?MK_HI:''}><td>Penghargaan “Top Marketer of the Month” (plakat &amp; sertifikat) — realisasi ≥ ${PB_RP(MK_S4_TOP)}</td>
          <td class="num mono">${semua?info.topSemua.length+' PIC':'—'}</td>
          <td class="num mono">${topTeks}</td></tr>
      </tbody></table></div>
    <div class="helper" style="margin-top:10px">Cuti tambahan berlaku <b>akumulatif selama 1 tahun</b>. Sisa event yang belum genap ${MK_S4_CUTI_PER} tidak dibulatkan ke atas — dan tidak dibawa ke bulan berikutnya oleh halaman ini, karena periode yang dibaca cuma yang dipilih di atas.</div>
  </div>`;
}

/* Seluruh kartu bonus, satu pintu — supaya drawPic() tidak perlu tahu ada
   berapa skema, dan supaya menambah skema kelima tidak menyentuh dua tempat. */
function kartuBonusMk(info, pid, e, a, list){
  return baguRingkasMk(info,pid,e,a)
    +`<div class="card" style="padding:12px 16px"><div class="card-sub" style="margin:0">
        <b>Skema 1 + 2 + 3 diakumulasi</b> jadi Bonus Tunai${pid==='__all__'?' tiap PIC':''};
        <b>Skema 4 berdiri sendiri</b> karena bentuknya voucher, cuti, dan penghargaan.
        Pencairan tetap lewat verifikasi &amp; persetujuan — kartu-kartu ini hanya menunjukkan posisi capaian.</div></div>`
    +kartuSkema1(info)
    +kartuSkema2(info,pid,a)
    +kartuSkema3(info,list,pid)
    +kartuSkema4(info,pid,list);
}

/* ============ BONUS EVENT ============
   Skema SDM tim Event, dipasang 7 September 2026 atas permintaan user. Empat
   skema, bentuknya sama dengan Bonus Marketing di atas supaya yang membuka dua
   halaman itu tidak perlu belajar dua cara membaca:

     Skema 1  Bonus per event      tangga dari omset TIAP event, nominal /orang
     Skema 2  Target bulanan       pool TIM dari JUMLAH event sebulan, dibagi tim
     Skema 3  Non-Tunai            voucher F&B per event
     Skema 4  Total omset bulanan  tangga per PIC

   SKEMA 1 + 2 + 4 DIAKUMULASI jadi satu angka rupiah; SKEMA 3 BERDIRI SENDIRI
   (permintaan user: "vouchernya di hitung terpisah"). Penomorannya sengaja
   MENGIKUTI DOKUMEN, bukan diurutkan ulang supaya yang tunai berdampingan —
   yang memegang dokumen SDM-nya akan mencari "Skema 3" dan harus menemukan
   voucher di situ.

   DASARNYA NET, DAN INI BEDA DARI BONUS MARKETING. Dokumennya menyebutkan
   sendiri: "Angka dari nett (Sebelum tax & services)". Yang dibaca karena itu
   `amount` — kolom **Nilai Event** di tabel Daftar Event halaman ini — BUKAN
   `porsi`, yang untuk event cuma SEPARUHNYA (porsiPic: amount/2 + Open Bill).
   Dipakai porsi, seluruh tangga di bawah praktis tidak pernah tercapai dan
   tidak seorang pun akan curiga: angkanya kecil, dan kecil itu terbaca sebagai
   bulan yang sepi.

   Potongan compliment SENGAJA TIDAK dikurangkan dari dasarnya. Akibatnya orang
   bisa menjumlahkan sendiri kolom Nilai Event di layar dan mendapat angka yang
   sama persis dengan dasar tangganya — dasar bonus yang tidak bisa dicocokkan
   dengan tabel yang berdiri di layar yang sama adalah dasar yang berhenti
   dipercaya.

   Seluruh nominal ditulis PENUH, bukan "35 jt" (permintaan user). */

/* ---- SKEMA 1 — tangga per event, nominal PER ORANG ----
   Dokumennya berlubang di dua tempat: "Rp35 – 45 juta" lalu "Rp46 – 55 juta"
   (Rp45.000.001–Rp45.999.999 tidak disebut), dan "Rp46 – 55 juta" lalu
   "> Rp56 juta" (Rp55.000.001–Rp55.999.999 tidak disebut). Keduanya dimasukkan
   ke tangga DI ATASNYA — memihak tim, aturan yang sama dengan MK_S2 di Bonus
   Marketing. Tangga berlubang membuat omset yang NAIK bisa MENURUNKAN bonus,
   dan itu tidak pernah bisa dijelaskan ke orang yang menerimanya.

   Label ditulis dari `min` INI, bukan dari kalimat dokumennya, supaya yang
   dibaca di layar sama persis dengan yang dihitung. */
const EV_S1=[
  { min:100000001, bonus:1000000, label:'Di atas Rp100.000.000' },
  { min: 55000001, bonus: 500000, label:'Rp55.000.001 – Rp100.000.000' },
  { min: 45000001, bonus: 400000, label:'Rp45.000.001 – Rp55.000.000' },
  { min: 35000000, bonus: 300000, label:'Rp35.000.000 – Rp45.000.000' },
];

/* ---- SKEMA 2 — JUMLAH event sebulan, pool tim ----
   Baris "8 event" di dokumen berbunyi "tidak ada bonus (standar kerja)", jadi
   ia bukan tangga melainkan garis dasar; disimpan terpisah supaya tetap bisa
   digambar di tabel tanpa pernah ikut memberi rupiah. AMBIL YANG TERTINGGI:
   12 event tidak juga menerima bonus baris 10 event. */
const EV_S2=[
  { min:12, bonus:500000 },
  { min:10, bonus:200000 },
];
const EV_S2_DASAR=8;

/* ---- SKEMA 3 — non-tunai, per event ----
   "di atas Rp X" di sini dibaca HARFIAH (> X), beda dari Bonus Marketing yang
   terpaksa membacanya ">= X" karena di sana satu ambang yang sama ditulis dua
   kali dengan kata berbeda. Di dokumen event tidak ada tabrakan seperti itu:
   30/56/100 cuma muncul di daftar ini. Tiap event dihitung SEKALI, di tangga
   tertingginya — event Rp120 juta memberi Rp250.000, bukan Rp250.000 +
   Rp150.000 + Rp100.000. */
const EV_S3_VOUCHER=[
  { min:100000001, nilai:250000 },
  { min: 56000001, nilai:150000 },
  { min: 30000001, nilai:100000 },
];

/* ---- SKEMA 4 — tangga per PIC dari total nilai omset sebulan ----
   Tabelnya BEDA dari MK_S2 milik marketing (tangga maupun nominalnya), jadi
   sengaja tabel sendiri — menyatukannya berarti satu perubahan di sini
   diam-diam menggeser bonus divisi sebelah. Celah di dokumen (Rp200–201,
   Rp250–251, Rp300–301 juta) dimasukkan ke tangga di atasnya, sama dengan
   Skema 1. */
const EV_S4=[
  { min:350000001, bonus:1000000, label:'Di atas Rp350.000.000' },
  { min:300000001, bonus: 700000, label:'Rp300.000.001 – Rp350.000.000' },
  { min:250000001, bonus: 500000, label:'Rp250.000.001 – Rp300.000.000' },
  { min:200000001, bonus: 350000, label:'Rp200.000.001 – Rp250.000.000' },
  { min:150000000, bonus: 250000, label:'Rp150.000.000 – Rp200.000.000' },
];

function tanggaEvS4(nilai){
  const t=mkTangga(EV_S4,nilai);
  if(t) return Object.assign({},t,{ next:EV_S4[EV_S4.indexOf(t)-1]||null });
  return { min:0, bonus:0, label:'Belum masuk tangga', next:EV_S4[EV_S4.length-1] };
}

/* SATU tempat yang menghitung seluruh skema event, dari `agg` yang sama dengan
   yang menggambar tabel Daftar Event. Alasan yang sama dengan bonusMarketing():
   dua tempat yang menghitung bonus sendiri-sendiri akan berselisih suatu hari,
   dan yang selisih itu uang. */
function bonusEvent(list, agg){
  const evSemua=[]; const aktif=[];
  list.forEach(e=>{
    const a=agg[e.id]; if(!a) return;
    if(a.events.length) aktif.push(e.id);
    a.events.forEach(ev=>evSemua.push(ev));
  });

  /* --- SKEMA 2: pool tim dari JUMLAH event, bukan nilainya --- */
  const s2tier=mkTangga(EV_S2,evSemua.length);
  const s2pool=s2tier?s2tier.bonus:0;
  /* Pembaginya PIC yang punya event bulan itu, bukan seluruh roster — alasan
     yang sama dengan pool Skema 1 di Bonus Marketing: roster ini tumbuh sendiri
     dari Tim/Keterangan Office dan rutin menyimpan nama yang sudah pindah tim.
     Angkanya selalu disebut di layar. */
  const s2bagi=aktif.length;
  const s2per=s2bagi?Math.floor(s2pool/s2bagi):0;

  const per={};
  list.forEach(e=>{
    const a=agg[e.id]||{real:0,events:[]};
    const evs=a.events||[];
    /* Skema 1 — per event, di tangga tertinggi tiap event saja. */
    let s1=0; const s1Jml={};
    evs.forEach(ev=>{ const t=mkTangga(EV_S1,PB_NUM(ev.amount));
      if(t){ s1+=t.bonus; s1Jml[t.min]=(s1Jml[t.min]||0)+1; } });
    /* Skema 3 — voucher, aturan pemilihan tangga yang sama. */
    let voucher=0; const vJml={};
    evs.forEach(ev=>{ const t=mkTangga(EV_S3_VOUCHER,PB_NUM(ev.amount));
      if(t){ voucher+=t.nilai; vJml[t.min]=(vJml[t.min]||0)+1; } });
    /* Skema 4 — dasarnya jumlah NILAI EVENT PIC itu, angka yang bisa
       dijumlahkan sendiri dari kolom Nilai Event di tabel sebelah. */
    const net=evs.reduce((s,ev)=>s+PB_NUM(ev.amount),0);
    const s4=tanggaEvS4(net);
    const ikutS2=aktif.indexOf(e.id)>-1;
    per[e.id]={ s1:s1, s1Jml:s1Jml, s2:ikutS2?s2per:0, ikutS2:ikutS2,
      s4:s4, net:net, jumEvent:evs.length,
      tunai:s1+(ikutS2?s2per:0)+s4.bonus,
      voucher:voucher, vJml:vJml };
  });
  return { per:per, jumPic:list.length, jumEvent:evSemua.length,
    s2:{ tier:s2tier, pool:s2pool, bagi:s2bagi, perPic:s2per },
    tunaiSemua:list.reduce((s,e)=>s+per[e.id].tunai,0),
    voucherSemua:list.reduce((s,e)=>s+per[e.id].voucher,0),
    netSemua:list.reduce((s,e)=>s+per[e.id].net,0) };
}

/* ---- PENGGAMBAR KARTU BONUS EVENT ----
   Bentuknya sengaja sama persis dengan kartu Bonus Marketing: satu baris tiga
   kotak posisi sekarang, lalu tangganya sebagai tabel. MK_HI dipakai bersama —
   dua warna sorot yang beda di dua halaman sejenis cuma membuat orang mengira
   salah satunya menandai hal lain. */

/* NOMINAL SKEMA 1 ITU PER ORANG, dan halaman ini menghitungnya untuk PIC yang
   TERCATAT di baris breakdown — Office tidak menyimpan siapa saja anggota tim
   sebuah event, jadi tidak ada angka lain yang bisa dipakai. Kalau timnya lebih
   dari satu orang, yang dibayarkan adalah angka ini DIKALI jumlah orangnya.
   Itu dikatakan di layar, bukan cuma di komentar: total yang diam-diam berarti
   "kalau timnya satu orang" akan dipakai menyiapkan pembayaran apa adanya. */
function baguRingkasEv(info, pid, e, a){
  const semua=pid==='__all__';
  const p=semua?null:info.per[pid];
  const tunai=semua?info.tunaiSemua:(p?p.tunai:0);
  const voucher=semua?info.voucherSemua:(p?p.voucher:0);
  const rinci=semua
    ? `jumlah bonus tunai ${info.jumPic} PIC di roster event`
    : (p?`Skema 1 ${PB_RP(p.s1)} · 2 ${PB_RP(p.s2)} · 4 ${PB_RP(p.s4.bonus)}`:'—');
  /* Kotak tengah: per PIC menjawab "kurang berapa lagi" (Skema 4), yang cuma
     bisa dijawab per orang. Di segmen Semua ia diganti angka tim — tangga
     Skema 4 dihitung dari omset SATU PIC, jadi menerapkannya ke angka gabungan
     memberi tangga yang tidak akan pernah diterima siapa pun. */
  const tengah=semua
    ? `<div class="stat"><div class="lab">Event Tim Bulan Ini</div><div class="val sm">${info.jumEvent}</div>
        <div class="foot">${info.s2.tier?`Skema 2 ${PB_RP(info.s2.pool)} dibagi ${info.s2.bagi} PIC`:`belum mencapai ${EV_S2[EV_S2.length-1].min} event`}</div></div>`
    : (function(){
        const s4=p.s4, kurang=s4.next?Math.max(0,s4.next.min-p.net):0;
        return `<div class="stat"><div class="lab">${s4.next?'Menuju Tangga Skema 4':'Tangga Skema 4 Tertinggi'}</div>
          <div class="val sm mono">${s4.next?PB_RP(kurang):'—'}</div>
          <div class="foot">${s4.next?`lagi untuk bonus ${PB_RP(s4.next.bonus)}`:'sudah di tangga teratas'}</div></div>`;
      })();
  return `<div class="grid g3">
    <div class="stat ${tunai?'accent':''}"><div class="lab">Bonus Tunai${semua?' — Seluruh Tim':''}</div>
      <div class="val sm mono">${PB_RP(tunai)}</div><div class="foot">${PB_ESC(rinci)}</div></div>
    ${tengah}
    <div class="stat"><div class="lab">Non-Tunai (Skema 3)</div>
      <div class="val sm mono">${voucher?PB_RP(voucher):'—'}</div>
      <div class="foot">voucher F&amp;B${voucher?'':' · belum ada'}</div></div>
  </div>`;
}

function kartuEvS1(info, pid, list){
  const semua=pid==='__all__';
  const jml=m=>semua?list.reduce((s,x)=>s+((info.per[x.id].s1Jml[m])||0),0):((info.per[pid].s1Jml[m])||0);
  const baris=EV_S1.slice().reverse().map(t=>{
    const n=jml(t.min);
    return `<tr${n?MK_HI:''}><td>${PB_ESC(t.label)}</td>
      <td class="num mono">${n} event</td>
      <td class="num mono">${PB_RP(t.bonus)} <span class="muted">/orang</span></td>
      <td class="num mono">${n?'<b>'+PB_RP(t.bonus*n)+'</b> ✓':'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const total=semua?list.reduce((s,x)=>s+info.per[x.id].s1,0):info.per[pid].s1;
  return `<div class="card">
    <h3>1️⃣ Skema 1 — Bonus per Event</h3>
    <div class="card-sub">Tangga dari <b>omset tiap event</b>, dihitung per event lalu dijumlahkan.
      Dasarnya kolom <b>Nilai Event</b> di tabel sebelah — <b>net, sebelum tax &amp; service</b>, sesuai catatan di skemanya.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>F&amp;B Sales Internal Event</th><th class="num">Tercapai</th><th class="num">Bonus Tim Event</th><th class="num">Diperoleh</th></tr></thead>
      <tbody>
        <tr><td>Di bawah ${PB_RP(35000000)}</td><td class="num mono">${semua?info.jumEvent-EV_S1.reduce((s,t)=>s+jml(t.min),0):info.per[pid].jumEvent-EV_S1.reduce((s,t)=>s+jml(t.min),0)} event</td>
          <td class="num mono">—</td><td class="num mono"><span class="muted">standar kerja</span></td></tr>
        ${baris}
      </tbody>
      <tfoot><tr><th colspan="3">Total Skema 1</th><th class="num mono">${PB_RP(total)} <span class="muted">/orang</span></th></tr></tfoot>
    </table></div>
    <div class="helper" style="margin-top:10px"><b>Nominalnya per orang.</b> Halaman ini menghitungnya untuk <b>PIC yang tercatat</b> di baris breakdown —
      Office tidak menyimpan siapa saja anggota tim sebuah event. Kalau timnya lebih dari satu orang, yang dibayarkan angka ini <b>dikali jumlah orangnya</b>.
      Tiap event dihitung sekali, di tangga tertingginya.</div>
  </div>`;
}

function kartuEvS2(info){
  const baris=EV_S2.slice().reverse().map(t=>{
    const aktif=!!(info.s2.tier&&info.s2.tier.min===t.min);
    return `<tr${aktif?MK_HI:''}><td>${aktif?'<b>':''}${t.min} event internal / Collab${aktif?'</b> ✓':''}</td>
      <td class="num mono">${aktif?'<b>'+PB_RP(t.bonus)+'</b>':PB_RP(t.bonus)}</td></tr>`;
  }).join('');
  return `<div class="card">
    <h3>2️⃣ Skema 2 — Bonus Target Bulanan (Performance Team)</h3>
    <div class="card-sub">Dari <b>JUMLAH event</b> tim event pada periode ini, bukan nilainya: <b>${info.jumEvent} event</b>${
      info.s2.tier?` — masuk tangga ${info.s2.tier.min} event`:' — belum masuk tangga mana pun'}.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Target Event Internal Per Bulan</th><th class="num">Total Bonus (dibagi tim)</th></tr></thead>
      <tbody>
        <tr${info.s2.tier?'':MK_HI}><td>${info.s2.tier?'':'<b>'}${EV_S2_DASAR} event internal / Collab${info.s2.tier?'':'</b> ✓'}</td>
          <td class="num mono"><span class="muted">standar kerja</span></td></tr>
        ${baris}
      </tbody>
      <tfoot><tr><th>Pool tim</th><th class="num mono">${PB_RP(info.s2.pool)}</th></tr>
        <tr><th>Dibagi ke ${info.s2.bagi} PIC yang punya event periode ini</th>
          <th class="num mono">${PB_RP(info.s2.perPic)} <span class="muted">/ PIC</span></th></tr></tfoot>
    </table></div>
    <div class="helper" style="margin-top:10px">Berbeda dari Skema 1: yang ini <b>satu pool yang dibagi</b>, bukan nominal per orang. Yang berlaku hanya tangga tertinggi.</div>
  </div>`;
}

function kartuEvS3(info, pid, list){
  const semua=pid==='__all__';
  const jml=m=>semua?list.reduce((s,x)=>s+((info.per[x.id].vJml[m])||0),0):((info.per[pid].vJml[m])||0);
  const baris=EV_S3_VOUCHER.slice().reverse().map(t=>{
    const n=jml(t.min);
    return `<tr${n?MK_HI:''}><td>Voucher F&amp;B ${PB_RP(t.nilai)} untuk tiap event di atas ${PB_RP(t.min-1)}</td>
      <td class="num mono">${n} event</td>
      <td class="num mono">${n?'<b>'+PB_RP(t.nilai*n)+'</b> ✓':'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  return `<div class="card">
    <h3>3️⃣ Skema 3 — Bonus Non-Tunai (insentif tambahan)</h3>
    <div class="card-sub">Voucher F&amp;B — <b>tidak dijumlahkan</b> ke Bonus Tunai di atas (permintaan user).
      Nilainya rupiah, tapi yang keluar bukan uang: menjumlahkannya membuat angka yang tidak bisa dicairkan tampak seperti yang bisa.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Insentif</th><th class="num">Tercapai</th><th class="num">Diperoleh</th></tr></thead>
      <tbody>${baris}</tbody>
      <tfoot><tr><th colspan="2">Total voucher</th><th class="num mono">${PB_RP(semua?info.voucherSemua:info.per[pid].voucher)}</th></tr></tfoot>
    </table></div>
    <div class="helper" style="margin-top:10px">Tiap event dihitung sekali, di tangga tertingginya — event ${PB_RP(120000000)} memberi ${PB_RP(250000)}, bukan ketiganya sekaligus.</div>
  </div>`;
}

function kartuEvS4(info, pid){
  const semua=pid==='__all__';
  const s4=semua?null:info.per[pid].s4;
  // Segmen Semua tidak menilai satu orang — lihat selRealisasi().
  const real=semua?null:info.per[pid].net;
  const baris=EV_S4.slice().reverse().map(t=>{
    const aktif=!!(s4&&s4.bonus&&s4.min===t.min);
    return `<tr${aktif?MK_HI:''}><td>${aktif?'<b>'+PB_ESC(t.label)+'</b> ✓':PB_ESC(t.label)}</td>
      ${selRealisasi(real,t.min,aktif)}
      <td class="num mono">${aktif?'<b>'+PB_RP(t.bonus)+'</b>':PB_RP(t.bonus)}</td></tr>`;
  }).join('');
  const bawah=(s4&&!s4.bonus)?MK_HI:'';
  return `<div class="card">
    <h3>4️⃣ Skema 4 — Tangga Total Nilai Omset per PIC</h3>
    <div class="card-sub">Dasarnya <b>jumlah Nilai Event PIC itu sendiri</b> pada periode ini (net, sebelum tax &amp; service).
      ${semua?'<b>Dinilai per PIC</b>; angka gabungan tidak dipakai di sini, pilih namanya di atas.':`Totalnya ${PB_RP(info.per[pid].net)} dari ${info.per[pid].jumEvent} event — bisa dijumlahkan sendiri dari kolom Nilai Event di tabel sebelah.`}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Total Nilai Omset / Bulan</th><th class="num">Realisasi</th><th class="num">Bonus untuk Tim Event</th></tr></thead>
      <tbody>
        <tr${bawah}><td>${bawah?'<b>Di bawah '+PB_RP(150000000)+'</b> ✓':'Di bawah '+PB_RP(150000000)}</td>${selRealisasi(real,0,!!bawah)}<td class="num mono">—</td></tr>
        ${baris}
      </tbody></table></div>
  </div>`;
}

/* Seluruh kartu bonus event, satu pintu — sama dengan kartuBonusMk(). */
function kartuBonusEv(info, pid, e, a, list){
  return baguRingkasEv(info,pid,e,a)
    +`<div class="card" style="padding:12px 16px"><div class="card-sub" style="margin:0">
        <b>Skema 1 + 2 + 4 diakumulasi</b> jadi Bonus Tunai${pid==='__all__'?' tiap PIC':''};
        <b>Skema 3 berdiri sendiri</b> karena bentuknya voucher. Penomorannya mengikuti dokumen SDM-nya, jadi yang tunai tidak berurutan.
        Seluruh angkanya <b>net, sebelum tax &amp; service</b> — bukan kolom Diakui, yang untuk event hanya separuh nilai event.
        Laporan maksimal 7–14 hari setelah event selesai; pencairan ikut gajian. Kartu-kartu ini hanya menunjukkan posisi capaian.</div></div>`
    +kartuEvS1(info,pid,list)
    +kartuEvS2(info)
    +kartuEvS3(info,pid,list)
    +kartuEvS4(info,pid);
}

/* Yang dipakai tuan rumah. Sisanya sengaja tidak diekspor: konstanta tangga
   dan kartu per-skema adalah urusan dalam berkas ini, dan tuan rumah yang
   menyentuhnya langsung akan jadi tempat kedua yang memutuskan angka uang. */
window.bonusMarketing=bonusMarketing;
window.bonusEvent=bonusEvent;
window.kartuBonusMk=kartuBonusMk;
window.kartuBonusEv=kartuBonusEv;
window.pbSetKeterangan=pbSetKeterangan;
/* Penentu Head. Diekspor karena tuan rumah butuh yang SAMA untuk memutuskan
   siapa boleh melihat seluruh tim — dua penentu untuk satu jabatan pasti
   menyimpang, dan yang menyimpang di sini bonus sejuta plus hak lihat. */
window.pbHead=pbHead;
/* Diekspor KHUSUS untuk uji: keduanya dipotong dan dijalankan langsung oleh
   tools/uji-bonus-*.js. Tanpa ini ujinya harus menulis ulang rumusnya. */
window.PB_UJI={ mkTangga:mkTangga, bonusS2:bonusS2, tanggaEvS4:tanggaEvS4,
  mkCorporate:mkCorporate, pbHead:pbHead, selRealisasi:selRealisasi,
  kartuSkema1:kartuSkema1, kartuSkema2:kartuSkema2, kartuSkema3:kartuSkema3, kartuSkema4:kartuSkema4,
  kartuEvS1:kartuEvS1, kartuEvS2:kartuEvS2, kartuEvS3:kartuEvS3, kartuEvS4:kartuEvS4,
  MK_S2:MK_S2, MK_S3:MK_S3, MK_S1_JUMLAH:MK_S1_JUMLAH, MK_S1_EVENT:MK_S1_EVENT,
  MK_S4_VOUCHER:MK_S4_VOUCHER, MK_S1_MIN_EVENT:MK_S1_MIN_EVENT,
  MK_S4_CUTI_MIN:MK_S4_CUTI_MIN, MK_S4_CUTI_PER:MK_S4_CUTI_PER, MK_S4_TOP:MK_S4_TOP,
  EV_S1:EV_S1, EV_S2:EV_S2, EV_S2_DASAR:EV_S2_DASAR, EV_S3_VOUCHER:EV_S3_VOUCHER, EV_S4:EV_S4 };
})();
