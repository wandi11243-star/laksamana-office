# =====================================================================
# GRAPH-SRC — cerminan kerangka fungsi tiap modul, supaya graphify bisa
# "melihat" frontend.
# ---------------------------------------------------------------------
# MASALAH YANG DIPECAHKAN. graphify tidak mengenali `.html` sama sekali:
# manifest-nya cuma memuat php / jsx / sql / js / json / sh. Padahal 99%
# kode repo ini hidup di dalam satu blok <script> raksasa di
# deploy/<modul>/index.html. Akibatnya graf yang dihasilkan kuat di sisi
# backend (lib_*_mysql.php jadi hub) tapi buta total terhadap frontend: tidak
# satu pun penggambar halaman, router, atau normalisasi state yang jadi node.
# (Nama fungsi nyata sengaja TIDAK disebut di komentar ini — berkas ini ikut
# terbaca `Grep`, dan contoh nama di sini akan muncul sebagai hasil palsu tiap
# kali fungsi itu dicari.)
#
# KENAPA CUMA KERANGKA, BUKAN SALINAN UTUH. graphify MENGHORMATI
# .gitignore (sudah diuji 31 Juli 2026, dua kali: dengan dan tanpa
# dot-dir — berkas di direktori ter-gitignore tidak pernah masuk
# manifest). Jadi cerminannya WAJIB ter-track supaya terindeks. Menyalin
# blok skrip apa adanya berarti menggandakan ~2,5 MB kode ke dalam repo,
# dan karena ripgrep membaca berkas ter-track, SETIAP `Grep` nama fungsi
# akan mengembalikan dua hasil — yang asli dan salinannya. Itu memboroskan
# token pada tiap pencarian, dan cepat atau lambat ada yang menyunting
# salinan yang mati lalu bingung kenapa halamannya tidak berubah.
#
# Maka yang ditulis hanya:
#     function namaFungsi(){ fungsiYangDipanggil(); ... }
# Tanpa isi badan, tanpa string, tanpa HTML. Cukup untuk graf panggilan
# (itu memang satu-satunya hal yang graphify baca dari sini), kecil
# (puluhan KB, bukan megabyte), dan `Grep` cuma menabrak satu baris
# deklarasi — bukan seluruh badan fungsi.
#
# KENAPA POWERSHELL, BUKAN NODE seperti tools/smoke-modul.js. Di mesin
# kerja ini `node` maupun `python` tidak terpasang (python yang ada cuma
# stub WindowsApps). Skrip node tidak bisa dijalankan maupun diuji di
# sini, dan generator yang tidak pernah bisa dijalankan penulisnya adalah
# generator yang salah tanpa ada yang tahu.
#
# CARA PAKAI:
#     powershell -ExecutionPolicy Bypass -File tools/graph-src.ps1
#     graphify update .
#
# Jalankan ulang SESUDAH menambah/menghapus/mengganti nama fungsi. Kalau
# tidak, grafnya berbohong — dan graf yang berbohong lebih buruk daripada
# tidak punya graf, karena ia dipercaya.
# =====================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $PSScriptRoot 'graph-src'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Kata kunci & fungsi bawaan browser. Dibuang dari daftar panggilan karena
# ia bukan kode repo ini: membiarkannya berarti `if`, `for`, dan
# `querySelector` jadi node paling terhubung di seluruh graf, menenggelamkan
# hub yang sebenarnya.
$abaikan = @(
  'if','for','while','switch','catch','return','typeof','function','new','do','else',
  'parseInt','parseFloat','isNaN','String','Number','Boolean','Array','Object','JSON','Math','Date',
  'setTimeout','setInterval','clearTimeout','clearInterval','fetch','alert','confirm','prompt',
  'querySelector','querySelectorAll','getElementById','addEventListener','removeEventListener',
  'console','require','import','Promise','Set','Map','RegExp','Error','encodeURIComponent',
  'decodeURIComponent','localStorage','sessionStorage','parse','stringify','map','filter','forEach',
  'reduce','sort','join','split','push','pop','slice','splice','indexOf','includes','replace','trim',
  'toLowerCase','toUpperCase','then','catch','finally','find','some','every','concat','keys','values'
) | ForEach-Object { $_.ToLower() }
$abaikanSet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($a in $abaikan) { [void]$abaikanSet.Add($a) }

# Semua halaman modul. deploy/index.html (portal Office) ikut: ia yang
# memegang daftar modul & sesi SSO.
$berkas = Get-ChildItem -Path (Join-Path $root 'deploy') -Recurse -Filter 'index.html' -File |
          Where-Object { $_.FullName -notmatch '\.sso-backup' }

$ringkas = @()
foreach ($f in $berkas) {
  $isi = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)

  # Nama keluaran dari jalur relatifnya: deploy/stock/purchasing/index.html
  # -> stock.purchasing.js. Memakai nama berkasnya saja akan menghasilkan
  # sebelas berkas bernama "index.js" yang saling menimpa.
  $rel = $f.FullName.Substring($root.Length + 1) -replace '\\','/'
  $nama = ($rel -replace '^deploy/','' -replace '/index\.html$','' -replace '\.html$','' -replace '/','.')
  if ($nama -eq 'index' -or $nama -eq '') { $nama = 'office-portal' }

  # Ambil isi tiap blok <script> yang BUKAN src eksternal. Blok bertag src
  # tidak punya isi untuk dibaca, dan blok JSON-LD/template bukan kode.
  #
  # Tiap blok disimpan bersama NOMOR BARIS AWALNYA di dalam index.html, bukan
  # digabung jadi satu teks. Itu yang membuat berkas kerangka bisa ditulis
  # sejajar baris demi baris dengan berkas aslinya (lihat bagian penulisan di
  # bawah) — tanpa peta ini, nomor baris yang dilaporkan graphify menunjuk ke
  # cerminannya sendiri dan masih harus dicari ulang di berkas asli.
  $segmen = @()
  foreach ($m in [regex]::Matches($isi, '(?is)<script(?<atr>[^>]*)>(?<isi>.*?)</script\s*>')) {
    $atr = $m.Groups['atr'].Value
    if ($atr -match '\bsrc\s*=') { continue }
    if ($atr -match 'type\s*=\s*"(?!text/javascript)') { continue }
    $g = $m.Groups['isi']
    $barisAwal = ([regex]::Matches($isi.Substring(0, $g.Index), "`n")).Count + 1
    $segmen += [pscustomobject]@{ Teks = $g.Value; BarisAwal = $barisAwal }
  }
  if ($segmen.Count -eq 0) { continue }
  $js = ($segmen | ForEach-Object { $_.Teks }) -join "`n"
  if ($js.Trim().Length -eq 0) { continue }

  # ---- daftar fungsi yang DIDEKLARASIKAN di modul ini ----
  # Dua bentuk yang dipakai repo: `function nama(` dan `const nama = (…) =>`.
  # `[ \t]*`, BUKAN `\s*`. `\s` memuat newline, jadi `^\s*function` bisa mulai
  # mencocok di baris KOSONG sebelum deklarasinya lalu melahap pergantian baris
  # — dan indeks cocokannya jatuh satu baris terlalu awal. Itu terjadi persis
  # pada fungsi yang didahului baris kosong, jadi salahnya tidak merata dan
  # sempat tertutupi oleh salah-hitung indeks larik di bawah (sudah kejadian
  # 31 Juli 2026: dua bug berlawanan arah saling meniadakan pada sebagian
  # fungsi, sehingga pemeriksaan sekilas tampak benar).
  $deklarasi = [ordered]@{}
  foreach ($m in [regex]::Matches($js, '(?m)^[ \t]*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(')) {
    $deklarasi[$m.Groups[1].Value] = $m.Index
  }
  foreach ($m in [regex]::Matches($js, '(?m)^[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\(|\([^)]*\)\s*=>)')) {
    if (-not $deklarasi.Contains($m.Groups[1].Value)) { $deklarasi[$m.Groups[1].Value] = $m.Index }
  }
  if ($deklarasi.Count -eq 0) { continue }

  # ---- potong kode jadi wilayah per fungsi ----
  # Batas wilayah = deklarasi berikutnya, BUKAN penutup kurung kurawal.
  # Menghitung kurawal berarti harus benar soal string, template literal,
  # regex literal, dan komentar — dan salah satu saja meleset membuat
  # seluruh sisa berkas masuk ke fungsi yang salah. Perkiraan "sampai
  # deklarasi berikutnya" jauh lebih tahan banting, dan untuk graf
  # panggilan ketelitiannya sudah memadai.
  $urut = $deklarasi.GetEnumerator() | Sort-Object Value
  $namaFungsi = @($urut | ForEach-Object { $_.Key })
  $posisi     = @($urut | ForEach-Object { $_.Value })

  # ---- peta baris: baris ke-N gabungan skrip -> baris ke berapa di index.html ----
  $petaBaris = New-Object System.Collections.Generic.List[int]
  foreach ($s in $segmen) {
    $jml = ([regex]::Matches($s.Teks, "`n")).Count + 1
    for ($r = 0; $r -lt $jml; $r++) { $petaBaris.Add($s.BarisAwal + $r) }
  }

  # Nomor baris tiap deklarasi, dihitung SEKALI jalan maju. Menghitungnya
  # per deklarasi dengan Substring dari awal berkas berarti memindai 400 KB
  # sebanyak 577 kali untuk marketing saja.
  $barisAsli = New-Object int[] $namaFungsi.Count
  $offsetLalu = 0
  $barisKini = 1
  for ($i = 0; $i -lt $namaFungsi.Count; $i++) {
    $barisKini += ([regex]::Matches($js.Substring($offsetLalu, $posisi[$i] - $offsetLalu), "`n")).Count
    $offsetLalu = $posisi[$i]
    $idx = $barisKini - 1
    $barisAsli[$i] = if ($idx -lt $petaBaris.Count) { $petaBaris[$idx] } else { $petaBaris[$petaBaris.Count - 1] }
  }

  # ---- tulis SEJAJAR BARIS dengan index.html ----
  # Tiap kerangka fungsi ditaruh di nomor baris yang SAMA dengan deklarasi
  # aslinya, sisanya baris kosong. Ini bukan kerapian: graphify melaporkan
  # lokasi node sebagai berkas:baris, jadi dengan penyejajaran ini
  # `graphify explain "namaFungsi"` langsung memberi nomor baris yang bisa
  # dipakai `Read -offset` pada index.html yang asli — tanpa satu pun Grep
  # tambahan. Tanpa penyejajaran, nomor barisnya menunjuk ke cerminan ini
  # sendiri dan tidak ada gunanya.
  # Baris kosong nyaris tak berbiaya (1 byte), jadi berkasnya tetap kecil.
  # Larik 0-based, nomor baris 1-based: baris N ada di indeks N-1. Sempat
  # tertukar, dan akibatnya seluruh berkas tergeser satu baris ke bawah.
  $maxBaris = ($barisAsli | Measure-Object -Maximum).Maximum
  $keluar = New-Object string[] $maxBaris
  for ($i = 0; $i -lt $namaFungsi.Count; $i++) {
    $mulai = $posisi[$i]
    $akhir = if ($i + 1 -lt $namaFungsi.Count) { $posisi[$i + 1] } else { $js.Length }
    $badan = $js.Substring($mulai, $akhir - $mulai)

    $dipanggil = [ordered]@{}
    foreach ($c in [regex]::Matches($badan, '([A-Za-z_$][\w$]*)\s*\(')) {
      $n = $c.Groups[1].Value
      if ($n -eq $namaFungsi[$i]) { continue }                 # deklarasinya sendiri
      if ($abaikanSet.Contains($n.ToLower())) { continue }
      if (-not $deklarasi.Contains($n)) { continue }           # hanya panggilan ke fungsi modul ini
      $dipanggil[$n] = $true
    }
    $isiFungsi = ($dipanggil.Keys | ForEach-Object { "$_();" }) -join ' '
    $stub = "function $($namaFungsi[$i])() { $isiFungsi }"

    # Dua deklarasi di baris yang sama (mis. dua arrow function sebaris)
    # digabung, bukan saling menimpa — yang tertimpa akan hilang dari graf
    # tanpa jejak.
    $b = $barisAsli[$i] - 1
    $keluar[$b] = if ([string]::IsNullOrEmpty($keluar[$b])) { $stub } else { $keluar[$b] + ' ' + $stub }
  }

  # Header ditaruh di baris 1-3. Aman: blok <script> selalu jauh di bawah
  # <head>, jadi tidak ada fungsi yang menempati baris-baris itu.
  $keluar[0] = "// DIHASILKAN OTOMATIS oleh tools/graph-src.ps1 - JANGAN DISUNTING."
  if ($maxBaris -ge 2) { $keluar[1] = "// Kerangka panggilan antar fungsi $rel, untuk dibaca graphify." }
  if ($maxBaris -ge 3) { $keluar[2] = "// Nomor baris di sini SAMA dengan nomor baris di $rel - sunting DI SANA." }

  $tujuan = Join-Path $outDir "$nama.js"
  [IO.File]::WriteAllText($tujuan, (($keluar | ForEach-Object { if ($null -eq $_) { '' } else { $_ } }) -join "`n"), (New-Object Text.UTF8Encoding($false)))
  $ringkas += [pscustomobject]@{ Modul = $nama; Fungsi = $namaFungsi.Count; KB = [math]::Round((Get-Item $tujuan).Length / 1KB, 1) }
}

$ringkas | Sort-Object Fungsi -Descending | Format-Table -AutoSize
"{0} berkas kerangka ditulis ke tools/graph-src/ ({1} fungsi, {2} KB total)" -f `
  $ringkas.Count, ($ringkas | Measure-Object Fungsi -Sum).Sum, [math]::Round((($ringkas | Measure-Object KB -Sum).Sum), 1)
