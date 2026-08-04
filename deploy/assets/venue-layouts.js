/* ============================================================
   DENAH VENUE LAKSAMANA MUDA — SUMBER TUNGGAL
   ------------------------------------------------------------
   Dipakai bersama oleh modul RESERVASI (denah hari-H, pilih meja) dan modul
   MARKETING (Reservasi VIP, mengunci meja lintas modul).

   Dulu definisinya hidup di dalam deploy/reservasi/index.html. Saat Marketing
   ikut perlu menggambar denah yang sama, satu-satunya pilihan lain adalah
   MENYALINNYA — dan dua salinan koordinat meja pasti lambat laun berbeda:
   meja yang digeser di satu modul tetap di tempat lama di modul satunya, lalu
   kru berdebat meja mana yang benar. Karena itu dipindah ke sini.

   Dimuat lewat <script src="../assets/venue-layouts.js"> SEBELUM skrip modul.
   Kalau berkas ini gagal dimuat, modul yang memakainya harus mengeluh keras
   dan berhenti — denah kosong yang diam jauh lebih berbahaya daripada pesan
   galat, karena tampak seperti "semua meja kosong".

   Koordinat memakai kanvas tetap 1600 x 1160; penggambarnya mengubahnya jadi
   persen, jadi denah ikut lebar berapa pun tanpa merusak proporsi.
   ============================================================ */
window.LM_SEAT_W=1600; window.LM_SEAT_H=1160;
window.LM_VENUE_LAYOUTS = (function(){
  const row=(ids,x0,y,w,h,gap,cap,zone)=>ids.map((id,i)=>({id:String(id),x:x0+i*(w+gap),y,w,h,cap,zone}));
  const col=(ids,x,y0,w,h,gap,cap,zone)=>ids.map((id,i)=>({id:String(id),x,y:y0+i*(h+gap),w,h,cap,zone}));
  const seq=(pre,a,b)=>{const o=[];for(let i=a;i<=b;i++)o.push(pre+i);return o;};
  const uBlock=[
    {id:"U1",x:190,y:20,w:180,h:150,cap:"7",zone:"dark"},
    {id:"U2",x:190,y:185,w:180,h:165,cap:"8",zone:"dark"},
    {id:"U3",x:190,y:365,w:180,h:160,cap:"9",zone:"dark"},
  ];
  const vip=[
    {id:"VIP 4",x:1480,y:20,w:110,h:112,cap:"6",zone:"vip"},
    {id:"VIP 3",x:1480,y:150,w:110,h:112,cap:"6",zone:"vip"},
    {id:"VIP 2",x:1480,y:280,w:110,h:112,cap:"6",zone:"vip"},
    {id:"VIP 1",x:1480,y:410,w:110,h:112,cap:"6",zone:"vip"},
  ];
  const weekday={
    name:"Weekday",
    fixed:[
      {t:"stage",label:"STAGE",x:630,y:10,w:380,h:210},
      {t:"entrance",label:"ENTRANCE IN / OUT",x:18,y:470,w:44,h:180},
    ],
    tables:[
      ...uBlock,
      ...row([21,22],395,25,80,80,25,"4","green"),
      ...row([23,24],395,150,80,80,25,"4","green"),
      {id:"41",x:1180,y:150,w:85,h:85,cap:"4",zone:"green"},
      {id:"42",x:1345,y:55,w:90,h:90,cap:"4",zone:"diamond"},
      {id:"43",x:1345,y:185,w:90,h:90,cap:"4",zone:"diamond"},
      {id:"44",x:1345,y:315,w:90,h:90,cap:"4",zone:"diamond"},
      {id:"45",x:1345,y:445,w:90,h:90,cap:"4",zone:"diamond"},
      ...vip,
      ...row([31,32,33,34,35],470,360,110,155,30,"7","wood"),
      {id:"R1",x:300,y:625,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R2",x:545,y:628,w:80,h:80,cap:"4",zone:"green"},
      {id:"R3",x:675,y:625,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R4",x:920,y:628,w:80,h:80,cap:"4",zone:"green"},
      {id:"R5",x:1050,y:625,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R6",x:1295,y:628,w:80,h:80,cap:"4",zone:"green"},
      ...row([11,12,13,14,15,16,17,18,19],120,815,130,80,25,"4-5","blue"),
      ...row([1,2,3,4,5,6,7,8,9],120,985,130,80,25,"4-5","blue"),
    ],
  };
  const weekend={
    name:"Weekend",
    fixed:[
      {t:"stage",label:"STAGE",x:590,y:10,w:380,h:200},
      {t:"dj",label:"MEJA DJ",x:775,y:250,w:150,h:70},
      {t:"entrance",label:"ENTRANCE IN / OUT",x:18,y:470,w:44,h:180},
    ],
    tables:[
      ...uBlock,
      {id:"EXT 1",x:390,y:25,w:75,h:95,cap:"4",zone:"ext"},
      {id:"EXT 2",x:500,y:25,w:75,h:95,cap:"4",zone:"ext"},
      {id:"EXT 3",x:390,y:140,w:75,h:95,cap:"4",zone:"ext"},
      {id:"EXT 4",x:500,y:140,w:75,h:95,cap:"4",zone:"ext"},
      {id:"EXT 5",x:390,y:250,w:75,h:58,cap:"4",zone:"ext"},
      {id:"EXT 6",x:120,y:180,w:70,h:90,cap:"4",zone:"ext"},
      {id:"EXT 7",x:120,y:290,w:70,h:90,cap:"4",zone:"ext"},
      {id:"EXT 8",x:120,y:400,w:70,h:90,cap:"4",zone:"ext"},
      {id:"EXT 9",x:230,y:532,w:110,h:55,cap:"4",zone:"ext"},
      {id:"EXT 10",x:80,y:760,w:70,h:110,cap:"4",zone:"ext"},
      {id:"EXT 11",x:80,y:960,w:70,h:110,cap:"4",zone:"ext"},
      {id:"EXT 14",x:1300,y:30,w:75,h:110,cap:"4",zone:"ext"},
      {id:"EXT 15",x:1400,y:30,w:75,h:110,cap:"4",zone:"ext"},
      {id:"31",x:470,y:250,w:110,h:150,cap:"7",zone:"wood"},
      {id:"32",x:470,y:420,w:110,h:150,cap:"7",zone:"wood"},
      {id:"33",x:1120,y:250,w:110,h:150,cap:"7",zone:"wood"},
      {id:"34",x:1120,y:420,w:110,h:150,cap:"7",zone:"wood"},
      {id:"22",x:625,y:290,w:80,h:80,cap:"4",zone:"green"},
      {id:"21",x:625,y:430,w:80,h:80,cap:"4",zone:"green"},
      {id:"24",x:1000,y:290,w:80,h:80,cap:"4",zone:"green"},
      {id:"23",x:1000,y:430,w:80,h:80,cap:"4",zone:"green"},
      {id:"42",x:1290,y:205,w:70,h:70,cap:"4",zone:"wood"},
      {id:"43",x:1365,y:205,w:70,h:70,cap:"4",zone:"wood"},
      {id:"44",x:1345,y:340,w:90,h:90,cap:"4",zone:"diamond"},
      {id:"45",x:1345,y:465,w:90,h:90,cap:"4",zone:"diamond"},
      ...vip,
      {id:"R1",x:300,y:690,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R2",x:545,y:693,w:80,h:80,cap:"4",zone:"green"},
      {id:"R3",x:675,y:690,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R5",x:920,y:690,w:200,h:85,cap:"10-12",zone:"wood"},
      {id:"R4",x:1160,y:693,w:80,h:80,cap:"4",zone:"green"},
      {id:"R6",x:1270,y:693,w:80,h:80,cap:"4",zone:"green"},
      {id:"41",x:1380,y:693,w:80,h:80,cap:"4",zone:"green"},
      ...row([11,12,13,14,15,16,17,18,19],170,865,128,78,22,"4-5","blue"),
      ...row([1,2,3,4,5,6,7,8,9],170,1005,128,78,22,"4-5","blue"),
    ],
  };
  const lantai2={
    name:"Lantai 2 (Weekday)",
    fixed:[
      {t:"stage",label:"VIDEOTRON",x:340,y:35,w:820,h:70},
      {t:"floor2",label:"LAYOUT LANTAI 2",x:340,y:120,w:820,h:475},
      {t:"tangga",label:"TANGGA MASUK",x:25,y:600,w:120,h:78},
      {t:"tangga",label:"TANGGA KELUAR",x:1455,y:600,w:120,h:78},
      {t:"foh",label:"FOH",x:560,y:895,w:180,h:150},
    ],
    tables:[
      ...col([51,52,53,54,55],25,40,95,90,22,"4","vip"),
      ...col(seq("M",1,10),175,40,125,46,12,"2","blue"),
      ...col(seq("M",31,40),1175,40,125,46,12,"2","blue"),
      ...col([71,72,73,74,75],1430,40,95,90,22,"4","vip"),
      ...row(seq("M",11,27),175,680,68,70,9,"2","blue"),
      {id:"61",x:30,y:780,w:120,h:85,cap:"4",zone:"blue"},
      {id:"87",x:1345,y:800,w:70,h:70,cap:"2",zone:"blue"},
      {id:"62",x:30,y:895,w:100,h:70,cap:"4",zone:"blue"},{id:"63",x:30,y:975,w:100,h:70,cap:"4",zone:"blue"},
      {id:"64",x:150,y:895,w:100,h:70,cap:"4",zone:"blue"},{id:"65",x:150,y:975,w:100,h:70,cap:"4",zone:"blue"},
      {id:"66",x:270,y:895,w:100,h:70,cap:"4",zone:"blue"},{id:"67",x:270,y:975,w:100,h:70,cap:"4",zone:"blue"},
      {id:"68",x:390,y:895,w:100,h:70,cap:"4",zone:"blue"},{id:"69",x:390,y:975,w:100,h:70,cap:"4",zone:"blue"},
      ...row([81,82,83,84,85,86],770,910,120,100,15,"4","diamond"),
    ],
  };
  /* Lantai 2 punya dua denah bawaan, sama seperti Lantai 1: hari biasa dan
     akhir pekan. Isinya SENGAJA dimulai identik dengan versi weekday —
     mengarang susunan meja akhir pekan yang tidak pernah dipasang siapa pun
     hanya akan menghasilkan denah yang salah tapi terlihat resmi. Kru
     menggesernya sendiri lewat Editor Denah, dan sejak itu keduanya hidup
     terpisah. */
  const lantai2_weekend=JSON.parse(JSON.stringify(lantai2));
  lantai2_weekend.name="Lantai 2 (Weekend)";

  return { weekday, weekend, lantai2, lantai2_weekend };
})();

