/* hpp-mesin.js — DIBANGKITKAN oleh tools/gen-hpp-mesin.js. JANGAN DISUNTING.
 *
 * Rumus modal modul HPP & Resep, diiris APA ADANYA dari deploy/stock/hpp/index.html
 * dan dibungkus pabrik supaya bisa dipakai modul lain (Menu Kalkulator Marketing)
 * tanpa menyalin rumusnya. Ubah rumusnya di modul HPP, lalu jalankan ulang
 * `node tools/gen-hpp-mesin.js` — tools/uji-kalkulator-hpp.js merah kalau basi.
 *
 *   var m = window.LMHppMesin({bahan, resep, setting, produk});
 *   m.modalPorsi(r), m.hargaJual(r), m.cogsOf(r), m.prasmananKah(r), m.resep
 */
(function(){
window.LMHppMesin = function(data){
  data = data || {};
  var S = { bahan: data.bahan || [], resep: data.resep || [] };
  var SET = { targetFood:0.33, targetDrink:0.33, buffer:0.05 };
  var PRODUK = data.produk || {}, PB = {}, PR = {}, MEMO = {};

const num=v=>{const n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));return isNaN(n)?0:n;};
const low=s=>String(s||'').trim().toLowerCase();
const SATUAN_FAM={
  'kg':['berat',1],'kilo':['berat',1],'kilogram':['berat',1],
  'gram':['berat',0.001],'gr':['berat',0.001],'g':['berat',0.001],
  'liter':['volume',1],'ltr':['volume',1],'l':['volume',1],
  'ml':['volume',0.001],'cc':['volume',0.001],
  /* SATUAN HITUNGAN. Bukan konversi fisika — ini kata yang sama dalam dialek
     berbeda: "1 Butir telur" dan "1 Pcs telur" benda yang sama persis, dan di
     data awal ada 14 baris resep yang menulis Butir/Btr untuk bahan yang
     harganya per Pcs. Yang TIDAK masuk sini: Slice, Lembar, Papan, Bks, Dus,
     Botol — itu KEMASAN, dan "1 Papan = berapa Pcs" beda tiap barang. */
  'pcs':['hitung',1],'butir':['hitung',1],'btr':['hitung',1],'biji':['hitung',1],'buah':['hitung',1]
};
const satFam=u=>SATUAN_FAM[String(u==null?'':u).trim().toLowerCase()];
function konvFam(qty,dari,ke){
  const a=satFam(dari), b=satFam(ke);
  if(!a||!b) return null;                       // ada yang kemasan / tak dikenal
  if(a[0]!==b[0]){
    const cair=(x,y)=>x==='berat'&&y==='volume';
    if(!cair(a[0],b[0])&&!cair(b[0],a[0])) return null;   // hitungan vs takaran
  }
  return qty*a[1]/b[1];
}
function infoPur(b){
  if(!b) return null;
  return PRODUK[b.nama]||(b.produk&&b.produk!=='-'?PRODUK[b.produk]:null);
}
function purDasar(p){ return String((p&&p.satuanDasar)||'').trim(); }
function purIsi(p){
  const v=p&&p.isi, out={};
  if(v&&typeof v==='object') Object.keys(v).forEach(k=>{
    const s=low(String(k).trim()), n=Number(v[k]); if(s&&n>0) out[s]=n; });
  return out;
}
function keDasarPur(qty,u,p){
  const d=purDasar(p); if(!d) return null;
  const a=low(String(u||'').trim());
  if(a===low(d)) return qty;
  const isi=purIsi(p); if(isi[a]>0) return qty*isi[a];
  return konvFam(qty,u,d);      // Liter terhadap ML: rasionya universal
}
function dariDasarPur(qty,u,p){
  const d=purDasar(p); if(!d) return null;
  const a=low(String(u||'').trim());
  if(a===low(d)) return qty;
  const isi=purIsi(p); if(isi[a]>0) return qty/isi[a];
  return konvFam(qty,d,u);
}
function konvSatuan(qty,dari,ke,pur){
  const f=konvFam(qty,dari,ke);
  if(f!==null) return f;
  if(!pur) return null;
  const b=keDasarPur(qty,dari,pur);
  if(b===null) return null;
  return dariDasarPur(b,ke,pur);
}
function qtySesuai(qty,dari,ke,pur){
  const d=String(dari||'').trim(), k=String(ke||'').trim();
  if(!d||!k||low(d)===low(k)) return {qty:qty,campur:false};
  const c=konvSatuan(qty,d,k,pur);
  if(c===null) return {qty:qty,campur:true};
  return {qty:c,campur:false};
}
function petakan(){
  PB={}; PR={}; MEMO={};
  S.bahan.forEach(b=>{ PB[low(b.nama)]=b; });
  /* Resep dipetakan per JENIS dulu, baru global. Ada nama yang muncul di food
     dan drink (mis. "Simple Syrup"); yang dipakai harus yang sejenis, kalau
     tidak modal drink bisa diam-diam memakai resep food. */
  S.resep.forEach(r=>{ PR[r.jenis+'|'+low(r.nama)]=r; if(!PR[low(r.nama)]) PR[low(r.nama)]=r; });
}
function cariResep(nama,jenis){ return PR[jenis+'|'+low(nama)]||PR[low(nama)]||null; }
function per1(b){ return (b&&num(b.qty_beli)>0)?num(b.harga_beli)/num(b.qty_beli):0; }
function sisiTersimpan(b){
  const s=low((b&&b.sisi_harga)||'');
  if(s==='beli'||s==='resep') return s;
  /* Warisan saklar `dibeli_jadi` yang berumur satu hari (17 Agustus 2026 pagi),
     sebelum sisi ketiga ada. Server sudah memindahkannya saat kolom baru lahir;
     ini lapis keduanya, untuk data yang keburu terbaca sebelum migrasi jalan. */
  return (b&&b.dibeli_jadi)?'beli':'';
}
function sisiHarga(b){
  const s=sisiTersimpan(b);
  if(s) return s;
  const r=b?PR[low(b.nama)]:null;
  return (r&&r.tipe==='base')?'resep':'';
}
const lewatResep=b=>{
  if(!b) return false;
  if(b.ref==='resep') return true;
  const it=PB[low(b.nama)];
  return !!(it&&sisiHarga(it)==='resep');
};
function modalResep(r,jalur){
  if(!r) return {total:0,hilang:[],siklus:false,campur:[]};
  if(MEMO[r.id]) return MEMO[r.id];
  jalur=jalur||{};
  if(jalur[r.id]) return {total:0,hilang:[],siklus:true,campur:[]};   // resep memanggil dirinya sendiri
  jalur[r.id]=1;
  let total=0, hilang=[], siklus=false, campur=[];
  (r.bahan||[]).forEach(b=>{
    if(!b||!b.nama) return;
    /* lewatResep(): `ref` baris ini, ATAU baris bahannya sendiri menyatakan
       harganya datang dari resep bernama sama (sisi 'resep'). Base olahan
       seperti Ayam Karage berdiri di daftar bahan cuma sebagai penopang nama
       untuk purchasing/CK dan harganya di sana nol — baris resep yang
       terlanjur bertipe Bahan akan menghitungnya Rp0 tanpa satu pun tanda. */
    if(lewatResep(b)){
      const sub=cariResep(b.nama,r.jenis);
      if(!sub){ hilang.push(b.nama); return; }
      const m=modalResep(sub,jalur);
      if(m.siklus) siklus=true;
      const perUnit=num(sub.yield_qty)>0?m.total/num(sub.yield_qty):0;
      /* Takaran baris DIKONVERSI ke satuan hasil resep yang dirujuk: base
         "Ayam Karage" hasil 1000 Gr dipakai 0,08 Kg tetap 80 Gr, bukan 0,08. */
      const q=qtySesuai(num(b.qty),b.satuan,sub.yield_unit);
      if(q.campur) campur.push(b.nama);
      total+=perUnit*q.qty;
      hilang=hilang.concat(m.hilang); campur=campur.concat(m.campur||[]);
    }else{
      const it=PB[low(b.nama)];
      if(!it){ hilang.push(b.nama); return; }
      /* per1(it) itu harga per SATUAN BELI bahan. Kalau barisnya menakar
         dengan satuan lain (beli per Kg, takar per Gram) harus dikonversi
         dulu — inilah tempat modal 1.000× dulu terbentuk. */
      const q=qtySesuai(num(b.qty),b.satuan,it.satuan,infoPur(it));
      if(q.campur) campur.push(b.nama);
      total+=per1(it)*q.qty;
    }
  });
  delete jalur[r.id];
  const hasil={total,hilang,siklus,campur};
  if(!siklus) MEMO[r.id]=hasil;    // hasil di bawah siklus tidak boleh disimpan
  return hasil;
}
function tanpaBahan(r){ return (r.bahan||[]).filter(b=>b&&b.nama).length===0; }
function modalDasar(r){
  const m=modalResep(r);
  if(tanpaBahan(r) && num(r.modal_manual)>0) return {total:num(r.modal_manual),hilang:[],siklus:false,campur:[],manual:true};
  return m;
}
function spareModal(){
  const p=num(SET.buffer);
  /* Negatif ditolak, bukan dipakai apa adanya: buffer negatif MENGURANGI modal,
     dan modal yang lebih murah daripada bahannya adalah angka yang menyesatkan
     tanpa satu pun tanda. Nol tetap sah — itu cara mematikan spare. */
  return (isFinite(p)&&p>0)?p:0;
}
function kenaSpare(r){ return !!r && r.tipe==='dish'; }
function modalMenu(r){
  const m=modalDasar(r);
  const p=kenaSpare(r)?spareModal():0;
  const spare=m.total*p;
  return {total:m.total+spare, bahan:m.total, spare:spare, rate:p,
          hilang:m.hilang, siklus:m.siklus, campur:m.campur, manual:!!m.manual};
}
function hargaJual(r){ return num(r.harga_baru)||0; }
function porsiYield(r){ const y=num(r&&r.yield_qty)||1; return y>0?y:1; }
function modalPorsi(r){ return modalMenu(r).total/porsiYield(r); }
function cogsOf(r){ const h=hargaJual(r); if(h<=0) return null; return modalPorsi(r)/h; }
function prasmananKah(r){ return /^PRASMANAN\b/i.test(String((r&&r.seksi)||'')); }

  if (data.setting) SET = Object.assign(SET, data.setting);
  /* Migrasi harga jual lama — SAMA dengan muat() di modul HPP. */
  S.resep.forEach(function(r){ if(!num(r.harga_baru)&&num(r.harga_lama)) r.harga_baru=num(r.harga_lama); });
  petakan();
  return { resep:S.resep, setting:SET, modalMenu:modalMenu, modalPorsi:modalPorsi, hargaJual:hargaJual,
           cogsOf:cogsOf, porsiYield:porsiYield, prasmananKah:prasmananKah };
};
})();
