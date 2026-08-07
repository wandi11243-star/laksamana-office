/* =====================================================================
   ABSENSI — Service Worker

   YANG DI-CACHE DAN YANG TIDAK, dan alasannya:

   DI-CACHE: kerangka halaman, pustaka face-api (1,3 MB), dan bobot model
   wajah (6,5 MB). Ketiganya tidak pernah berubah dalam sehari, dan tanpa
   cache setiap kru mengunduh 8 MB SETIAP KALI membuka aplikasi — di sinyal
   4G yang sibuk itu berarti menunggu setengah menit sebelum bisa menekan
   satu tombol.

   TIDAK DI-CACHE: seluruh panggilan api.php. Absensi bukan hal yang boleh
   dijawab dari cache — jawaban lama akan membuat kru melihat "sudah absen"
   padahal ketukannya tidak pernah sampai ke server, dan sebaliknya.

   TIDAK ADA ANTREAN OFFLINE, dan itu keputusan sadar. Absen offline berarti
   waktunya diambil dari jam HP, dan jam HP bisa diputar mundur dalam
   sepuluh detik lewat Pengaturan. Absensi yang menerima waktu dari perangkat
   yang diabsen tidak mencatat apa pun yang berarti. Kru yang tidak punya
   sinyal diberi pesan jelas, bukan janji palsu bahwa absennya "tersimpan".
   ===================================================================== */
const VERSI  = 'abs-v1';
const KERANGKA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/face-api.min.js',
  './models/tiny_face_detector_model-weights_manifest.json',
  './models/tiny_face_detector_model.bin',
  './models/face_landmark_68_tiny_model-weights_manifest.json',
  './models/face_landmark_68_tiny_model.bin',
  './models/face_recognition_model-weights_manifest.json',
  './models/face_recognition_model.bin',
  '../assets/LaksamanaMudaLogo.jpeg'
];

self.addEventListener('install', (e)=>{
  /* addAll gagal seluruhnya kalau SATU berkas gagal diunduh, dan itu akan
     membuat aplikasi tidak pernah terpasang hanya karena satu model belum
     ikut ter-deploy. Diunduh satu per satu, yang gagal dilewati. */
  e.waitUntil((async()=>{
    const c = await caches.open(VERSI);
    await Promise.all(KERANGKA.map(u => c.add(u).catch(()=>{})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const nama = await caches.keys();
    await Promise.all(nama.filter(n=>n!==VERSI).map(n=>caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.indexOf('api.php') > -1) return;   // absensi tidak boleh dijawab cache

  /* Model & pustaka: cache dulu, jaringan cuma kalau belum ada. Berkasnya
     besar dan isinya tidak pernah berubah tanpa ganti VERSI. */
  const berkasBesar = /\/(models|vendor)\//.test(url.pathname);
  if (berkasBesar) {
    e.respondWith((async()=>{
      const c = await caches.open(VERSI);
      const ada = await c.match(e.request);
      if (ada) return ada;
      const jwb = await fetch(e.request);
      if (jwb && jwb.ok) c.put(e.request, jwb.clone());
      return jwb;
    })());
    return;
  }

  /* Halaman: jaringan dulu, cache sebagai cadangan. Dibalik dari berkas
     besar karena index.html memang berubah tiap deploy, dan kru yang
     melihat versi lama akan melaporkan bug yang sudah diperbaiki. */
  e.respondWith((async()=>{
    try {
      const jwb = await fetch(e.request);
      if (jwb && jwb.ok && url.origin === location.origin) {
        const c = await caches.open(VERSI); c.put(e.request, jwb.clone());
      }
      return jwb;
    } catch (err) {
      const c = await caches.open(VERSI);
      const ada = await c.match(e.request) || await c.match('./index.html');
      if (ada) return ada;
      throw err;
    }
  })());
});
