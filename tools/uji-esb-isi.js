/* Uji isi-dari-ESB: Cashier (Report Daily, Compliment, Void, Rokok) + Finance Omset (Input, Breakdown). jsdom; aset esb-pos.js disisipkan inline. */
const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');const fs=require('fs');
const ROOT=require('path').join(__dirname,'..','deploy')+'/';
const aset=fs.readFileSync(ROOT+'assets/esb-pos.js','utf8');
const sisip=(h,src)=>h.replace(`<script src="${src}"></script>`,'<script>'+aset+'</script>');
const tgl=new Date(); const T=tgl.getFullYear()+'-'+String(tgl.getMonth()+1).padStart(2,'0')+'-'+String(tgl.getDate()).padStart(2,'0');
const M=(n,kat,price,qty,extra)=>Object.assign({menuName:n,menuCategoryName:kat,price,qty,statusName:'Ordered'},extra||{});
const bills=[
 {salesNum:'B1',statusName:'Paid',editedBy:'ANDY',visitPurposeName:'DINE IN',paxTotal:3,subtotal:100000,otherTaxTotal:5000,vatTotal:10000,grandTotal:115000,
   salesPayments:[{paymentMethodName:'CASH',paymentAmount:120000}],
   salesMenus:[M('NASI GORENG','FOOD',60000,1),M('ICE TEA','BEVERAGES',20000,2),M('LA BOLD','OTHERS',35000,1,{statusName:'Void',cancelNotes:'salah input',createdBy:'SULIS'})]},
 {salesNum:'B2',statusName:'Paid',editedBy:'ANDY',additionalInfo:'Ultah Pak Budi',paxTotal:1,otherTaxTotal:2500,vatTotal:5000,grandTotal:57500,
   salesPayments:[{paymentMethodName:'COMPLIMENT',paymentAmount:57500}],
   salesMenus:[M('BIRTHDAY CAKE','FOOD',50000,1)]},
 {salesNum:'B3',statusName:'Paid',visitPurposeName:'ESB ORDER',createdBy:'SYSTEM',paxTotal:1,otherTaxTotal:1000,vatTotal:2000,grandTotal:23000,
   salesPayments:[{paymentMethodName:'ESB PAY',paymentAmount:23000}],
   salesMenus:[M('KOPI SUSU','BEVERAGES',20000,1)]},
 {salesNum:'B4',statusName:'Paid',editedBy:'RINA',paxTotal:1,otherTaxTotal:0,vatTotal:0,grandTotal:72000,
   salesPayments:[{paymentMethodName:'QRIS BRI',paymentAmount:72000}],
   salesMenus:[M('LA BOLD','OTHERS',36000,2),M('DJARUM SUPER 12','OTHERS',0,0)]},
 {salesNum:'B5',statusName:'Cancel',cancelNotes:'tamu batal',createdBy:'TASYA',grandTotal:30000,salesPayments:[],
   salesMenus:[M('MIE AYAM','FOOD',30000,1)]},
 {salesNum:'B6',statusName:'Paid',editedBy:'XAVIER',paxTotal:2,otherTaxTotal:0,vatTotal:0,grandTotal:10000,
   salesPayments:[{paymentMethodName:'CASH',paymentAmount:10000}],salesMenus:[M('AIR','BEVERAGES',10000,1)]}
];
let hasil={ok:0,gagal:0};
const ok=(c,m)=>{ c?hasil.ok++:hasil.gagal++; console.log((c?'OK   ':'GAGAL ')+m); };
const tunggu=ms=>new Promise(r=>setTimeout(r,ms));
function buka(path,src,mods,stub){
  let html=sisip(fs.readFileSync(ROOT+path,'utf8'),src);
  const sesi={userId:'u1',name:'Kasir A',modules:mods,adminModules:mods,token:'t',expiry:Date.now()+9e6};
  const posts=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://dev.laksamanamuda.id/'+path.replace('index.html',''),beforeParse(w){
    w.localStorage.setItem('lm_session',JSON.stringify(sesi));
    w.fetch=async(u,o)=>{const b=o&&o.body&&typeof o.body==='string'?(()=>{try{return JSON.parse(o.body)}catch(e){return {}}})():{};posts.push(b);
      if(b.action==='esbHalaman') return {ok:true,json:async()=>({ok:true,data:{bills:b.page===1?bills:[],page:b.page,pageCount:1}}),text:async()=>''};
      const r=stub?stub(u,b):null; if(r) return {ok:true,json:async()=>r,text:async()=>JSON.stringify(r)};
      return {ok:true,json:async()=>({ok:true,data:{}}),text:async()=>'{"ok":true,"data":{}}'};};
    w.confirm=()=>true; w.alert=()=>{}; w.HTMLElement.prototype.scrollIntoView=function(){};}});
  return {w:dom.window,posts};
}
(async()=>{
  /* ---------- CASHIER ---------- */
  const C=buka('cashier/index.html','../assets/esb-pos.js',['cashier']);
  await tunggu(1500); const w=C.w;
  ok(!!w.esbPos,'aset termuat di cashier');
  // Compliment
  w.eval("compDate='"+T+"'; go('compliment')"); await tunggu(300);
  ok(!!w.document.getElementById('esb_komp'),'kartu compliment ada');
  w.eval("esbMuat('komp','"+T+"')"); await tunggu(600);
  const kk=w.document.getElementById('esb_komp').textContent;
  ok(/B2/.test(kk)&&/Ultah Pak Budi/.test(kk),'bill compliment terdaftar');
  ok(!/B1/.test(kk),'bill bukan compliment tidak ikut');
  w.eval("esbKompPakai(0)"); await tunggu(100);
  const val=id=>w.document.getElementById(id).value;
  ok(val('c_nama')==='Ultah Pak Budi','nama dari additionalInfo: '+val('c_nama'));
  ok(val('c_sub')==='50.000'&&val('c_tax')==='5.000'&&val('c_svc')==='2.500','sub/tax/svc '+val('c_sub')+' '+val('c_tax')+' '+val('c_svc'));
  ok(/57\.500/.test(w.document.getElementById('c_total').textContent),'total compliment ikut dihitung');
  ok(!C.posts.some(p=>p.action==='saveAll'),'compliment belum menyimpan');
  w.document.getElementById('c_add').click(); await tunggu(200);
  ok(w.eval("(DB.compliments||[]).some(c=>c.esbBill==='B2')"),'esbBill tercatat saat Tambah');
  ok(/sudah dicatat/.test(w.document.getElementById('esb_komp').textContent),'ditandai sudah dicatat sesudah tambah');
  // Void
  w.eval("voidDate='"+T+"'; go('voidb')"); await tunggu(400);
  ok(!!w.document.getElementById('esb_void'),'kartu void ada');
  w.eval("esbMuat('void','"+T+"')"); await tunggu(400);
  const vv=w.document.getElementById('esb_void').textContent;
  ok(/B1/.test(vv)&&/LA BOLD/.test(vv),'menu void di bill hidup terdaftar');
  ok(/B5/.test(vv)&&/MIE AYAM/.test(vv)&&/bill dibatalkan/.test(vv),'bill batal terdaftar');
  w.eval("esbVoidPakai(0)"); await tunggu(200);
  const F=w.eval("VD_FORM");
  ok(F.bill==='B1'&&F.penginput==='SULIS'&&F.alasan==='salah input','form void: '+F.bill+'/'+F.penginput+'/'+F.alasan);
  ok(F.items.length===1&&F.items[0].item==='LA BOLD'&&F.items[0].sub==='35000','item void '+JSON.stringify(F.items));
  ok(F.salah==='','kesalahan dari siapa tidak diisi');
  ok(w.document.getElementById('vd_bill').value==='B1','form void tergambar');
  ok(!C.posts.some(p=>p.action==='voidSimpan'),'void belum menyimpan');
  // Rokok
  w.eval("rokokDate='"+T+"'; go('rokok')"); await tunggu(300);
  w.document.getElementById('rk_esb').click(); await tunggu(500);
  const out=k=>w.document.querySelector(`.rkf[data-k="${k}"][data-f="out"]`).value;
  ok(out('la_bold')==='2','LA Bold keluar 2 (yang void tidak dihitung): '+out('la_bold'));
  ok(out('djarum_super')==='0','djarum super ditemukan tapi qty 0: '+out('djarum_super'));
  ok(out('la_purple')==='0','item tidak terjual tidak disentuh');
  ok(w.document.getElementById('rk_s_out').textContent==='2','total keluar ikut dihitung: '+w.document.getElementById('rk_s_out').textContent);
  ok(/Belum tersimpan/.test(w.document.getElementById('rk_esb_info').textContent),'info rokok');
  // Report daily tetap jalan
  w.eval("repDate='"+T+"'; go('report')"); await tunggu(300);
  w.document.getElementById('rp_esb').click(); await tunggu(500);
  const pv=k=>w.document.querySelector(`.rf[data-k="${k}"][data-f="pos"]`).value;
  ok(pv('cash')==='125.000','report cash dipotong kembalian: '+pv('cash'));
  ok(pv('compliment')==='57.500'&&pv('qris_esb')==='23.000'&&pv('qris_bri')==='72.000','report kolom lain');

  /* ---------- OMSET ---------- */
  const O=buka('finance/omset/index.html','../../assets/esb-pos.js',['kompas']);
  await tunggu(1500); const o=O.w;
  ok(!!o.esbPos,'aset termuat di omset');
  // Report Daily di Finance > Omset — angkanya wajib sama dengan Cashier
  o.eval("repDate='"+T+"'; go('report')"); await tunggu(300);
  const rb=o.document.getElementById('rp_esb'); ok(!!rb,'tombol POS dari ESB ada di Report Daily finance');
  if(rb){ rb.click(); await tunggu(500);
    const qv=k=>o.document.querySelector(`.rf[data-k="${k}"][data-f="pos"]`).value;
    ok(qv('cash')==='125.000'&&qv('compliment')==='57.500'&&qv('qris_esb')==='23.000'&&qv('qris_bri')==='72.000','finance report sama dengan cashier: '+qv('cash')+' '+qv('compliment')+' '+qv('qris_esb')+' '+qv('qris_bri'));
    ok(/277\.500/.test(o.document.getElementById('rc_pos').textContent),'total POS finance ikut: '+o.document.getElementById('rc_pos').textContent);
    ok(!O.posts.some(p=>p.action==='saveAll'),'report finance belum menyimpan');
  }
  o.eval("inputDate='"+T+"'; go('input')"); await tunggu(300);
  o.document.getElementById('i_esb').click(); await tunggu(500);
  const iv=id=>o.document.getElementById(id).value;
  // gross: B1 menus hidup 60000+40000=100000; net=115000-15000=100000 -> food 60000 bev 40000 disc 0
  // B2 net 50000 food 50000 ; B3 net 20000 bev 20000; B4 net 72000 lainnya 72000; B6 net 10000 bev 10000
  ok(iv('i_food')==='110.000','food '+iv('i_food'));
  ok(iv('i_bev')==='70.000','bev '+iv('i_bev'));
  ok(iv('i_lainnya')==='72.000','lainnya '+iv('i_lainnya'));
  ok(iv('i_discount')==='0','disc '+iv('i_discount'));
  ok(iv('i_svc')==='8.500'&&iv('i_tax')==='17.000','svc/tax '+iv('i_svc')+' '+iv('i_tax'));
  ok(iv('i_bill')==='5','bill 5 (batal tidak dihitung): '+iv('i_bill'));
  ok(iv('i_traffic')==='8','traffic dari pax: '+iv('i_traffic'));
  ok(iv('i_qfood')==='2'&&iv('i_qbev')==='4'&&iv('i_qothers')==='2','qty '+iv('i_qfood')+' '+iv('i_qbev')+' '+iv('i_qothers'));
  ok(/252\.000/.test(o.document.getElementById('s_omset').textContent),'omset net ikut: '+o.document.getElementById('s_omset').textContent);
  ok(!O.posts.some(p=>p.action==='saveAll'),'omset belum menyimpan');
  // breakdown: butuh hari tersimpan + kasir
  o.eval(`DB.employees.kasir=[{id:'k1',name:'Andy Pratama'},{id:'k2',name:'Rina'},{id:'k3',name:'Budi'}];
    DB.daily=(DB.daily||[]).filter(x=>x.date!=='${T}');
    DB.daily.push({date:'${T}',food:110000,bev:70000,lainnya:72000,discount:0,service_charge:8500,tax:17000,traffic:8,bill:5});
    bdDate='${T}'; PERIOD='${T.slice(0,7)}'; go('breakdown')`); await tunggu(400);
  const bb=o.document.getElementById('bd_esb');
  ok(!!bb,'tombol breakdown ada');
  if(bb){ bb.click(); await tunggu(500);
    const ks=k=>o.document.querySelector(`.ksf[data-i="${k}"][data-f="amount"]`).value;
    ok(ks(0)==='150.000','Andy: B1 100rb + B2 50rb = '+ks(0));
    ok(ks(1)==='72.000','Rina 72rb: '+ks(1));
    ok(ks(2)==='0','Budi nol: '+ks(2));
    ok(o.document.querySelector('.sof[data-f="amount"]').value==='20.000','self order 20rb');
    const inf=o.document.getElementById('bd_esb_info').textContent;
    ok(/XAVIER/.test(inf),'akun tak dikenal disebut');
    ok(!O.posts.some(p=>p.action==='saveAll'),'breakdown belum menyimpan');
  }
  console.log(`\n${hasil.ok} lulus, ${hasil.gagal} gagal`);
  process.exit(hasil.gagal?1:0);
})().catch(e=>{console.log('MATI',e.stack);process.exit(2);});
