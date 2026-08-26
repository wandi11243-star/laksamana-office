import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, GhostButton, Divider } from '../components/ui';
import { timeSlots, rupiah } from '../data/mockData';
import { layout, SEAT_W, SEAT_H, ZONE, FIXTURE_STYLE, takenTables } from '../data/venueLayout';
import ScreenHeader from '../components/ScreenHeader';

/*
  Deret tanggal untuk pemilih di atas layar.

  DULU: 7 hari mulai dari `new Date(2026, 7, 20)` — tanggal prototype yang
  dipatok mati. Akibatnya, begitu tanggal sungguhan melewatinya, seluruh
  pilihan berada di MASA LALU dan hari ini tidak ada di daftar sama sekali.
  Itu yang dilaporkan user sebagai "masih terbatas" (26 Agustus 2026): pada
  27 Agustus, yang tampil cuma 20–26 Agustus.

  SEKARANG: dihitung dari tanggal perangkat, dan sengaja MEMBENTANG KE DUA
  ARAH — hari-hari sebelumnya ikut bisa dipilih, sesuai permintaan user.
  Hari lampau dibiarkan bisa ditekan (bukan dimatikan) tapi ditandai redup;
  yang mengisikan reservasi susulan memang perlu memilihnya, dan mematikannya
  akan membuat kolom itu tidak bisa dipakai sama sekali untuk pencatatan
  belakangan.
*/
const HARI_MUNDUR = 14;   // seberapa jauh ke belakang boleh dipilih
const HARI_MAJU = 45;     // seberapa jauh ke depan
function buildDays() {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const out = [];
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);
  for (let off = -HARI_MUNDUR; off <= HARI_MAJU; off++) {
    const d = new Date(hariIni);
    d.setDate(hariIni.getDate() + off);
    out.push({
      key: out.length,          // indeks array — dipakai sebagai dayIdx
      off,                      // jarak hari dari hari ini (negatif = lampau)
      lampau: off < 0,
      iniHari: off === 0,
      dow: days[d.getDay()],
      day: d.getDate(),
      mon: months[d.getMonth()],
      // ISO dipakai kalau nanti layar ini menulis ke server; label untuk tampilan.
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return out;
}
// Lebar satu kartu tanggal + jarak antarkartu — dipakai menggeser deret ke
// posisi hari ini saat layar dibuka. Harus sama dengan styles.day.width dan
// gap ScrollView-nya; kalau salah satu diubah, yang lain ikut.
const DAY_W = 60;
const DAY_GAP = 10;

// Lebar kanvas denah (px). Koordinat asli 1600x1160 diskalakan ke lebar ini.
// Kanvas lebih lebar dari layar HP -> di-scroll mendatar. Sama seperti modul
// reservasi office yang denahnya juga di-scroll di layar sempit.
const MAP_W = 900;
const SCALE = MAP_W / SEAT_W;
const MAP_H = SEAT_H * SCALE;
const px = (v) => v * SCALE;

const takenSet = new Set(takenTables);

export default function ReservationScreen({ navigation }) {
  const days = useMemo(buildDays, []);
  // Pilihan awal = HARI INI, bukan elemen pertama: elemen pertama sekarang
  // 14 hari yang lalu, dan membuka layar reservasi dengan tanggal lampau
  // terpilih adalah cara paling mudah menghasilkan booking bertanggal salah.
  const idxHariIni = useMemo(() => Math.max(0, days.findIndex((d) => d.iniHari)), [days]);
  const { addReservation } = useApp();
  const [dayIdx, setDayIdx] = useState(idxHariIni);
  const dayScroll = useRef(null);
  const [time, setTime] = useState('19:00');
  const [pax, setPax] = useState(2);
  const [tables, setTables] = useState([]); // id meja terpilih
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  // Geser deret ke hari ini saat layar dibuka. Tanpa ini, yang tampil pertama
  // adalah 14 hari yang lalu — orangnya harus menggeser dulu sebelum bisa
  // memilih tanggal yang wajar, dan itu persis keluhan "terbatas" versi lain.
  const geserKeHari = (idx, animated) => {
    const x = Math.max(0, idx * (DAY_W + DAY_GAP));
    dayScroll.current?.scrollTo({ x, animated: !!animated });
  };
  useEffect(() => { const t = setTimeout(() => geserKeHari(idxHariIni, false), 0); return () => clearTimeout(t); }, [idxHariIni]);
  const pilihHari = (idx) => { setDayIdx(idx); geserKeHari(idx, true); };

  const tableById = useMemo(() => {
    const m = {};
    layout.tables.forEach((t) => { m[t.id] = t; });
    return m;
  }, []);

  const toggleTable = (t) => {
    if (takenSet.has(t.id)) return;
    setTables((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]));
  };

  // DP = jumlah biaya meja terpilih (biaya per zona, lihat venueLayout).
  const dp = tables.reduce((s, id) => {
    const t = tableById[id];
    return s + (t ? (ZONE[t.zone]?.fee || 0) : 0);
  }, 0);
  const canBook = tables.length > 0;

  const finalize = () => {
    addReservation({
      date: days[dayIdx].label,
      time,
      pax,
      seats: [...tables], // simpan id meja (ProfileScreen membacanya)
      dp,
    });
    setConfirm(false);
    setDone(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Reservasi Meja" subtitle="Pilih tanggal, jam & meja" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Tanggal */}
        <View style={styles.section}>
          <View style={styles.tglHead}>
            <Text style={styles.label}>Tanggal</Text>
            {/* Jalan pulang. Tanpa ini, orang yang sudah menggeser jauh ke
                belakang harus menggeser balik dengan jari — dan deretnya
                sekarang 60 hari. */}
            {dayIdx !== idxHariIni ? (
              <Pressable onPress={() => pilihHari(idxHariIni)} hitSlop={8}>
                <Text style={styles.tglKini}>Hari ini</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            ref={dayScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: DAY_GAP }}
          >
            {days.map((d) => {
              const aktif = dayIdx === d.key;
              return (
                <Pressable
                  key={d.key}
                  style={[styles.day, d.lampau && styles.dayLampau, aktif && styles.dayOn]}
                  onPress={() => setDayIdx(d.key)}
                >
                  <Text style={[styles.dayDow, d.lampau && styles.dayTeksLampau, aktif && { color: colors.onGold }]}>{d.dow}</Text>
                  <Text style={[styles.dayNum, d.lampau && styles.dayTeksLampau, aktif && { color: colors.onGold }]}>{d.day}</Text>
                  <Text style={[styles.dayMon, d.lampau && styles.dayTeksLampau, aktif && { color: colors.onGold }]}>{d.mon}</Text>
                  {/* Titik penanda hari ini — tetap terlihat walau kartunya
                      sedang tidak terpilih, supaya "hari ini yang mana"
                      terjawab tanpa menghitung mundur. */}
                  {d.iniHari ? <View style={[styles.dayDot, aktif && { backgroundColor: colors.onGold }]} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Tanggal terpilih ditulis lengkap berikut tahunnya. Deret kartu
              cuma memuat tanggal & bulan, dan pada rentang 60 hari itu bisa
              melewati pergantian tahun tanpa satu pun petunjuk di layar. */}
          <Text style={styles.tglPilih}>
            {days[dayIdx]?.label}
            {days[dayIdx]?.lampau ? '  ·  tanggal yang sudah lewat' : ''}
          </Text>
        </View>

        {/* Jam */}
        <View style={styles.section}>
          <Text style={styles.label}>Jam Kedatangan</Text>
          <View style={styles.slotWrap}>
            {timeSlots.map((t) => (
              <Pressable key={t} style={[styles.slot, time === t && styles.slotOn]} onPress={() => setTime(t)}>
                <Text style={[styles.slotText, time === t && { color: colors.gold }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Jumlah orang */}
        <View style={styles.section}>
          <View style={styles.paxRow}>
            <View>
              <Text style={styles.label}>Jumlah Orang</Text>
              <Text style={styles.paxHint}>Untuk rekomendasi kapasitas meja</Text>
            </View>
            <View style={styles.paxBox}>
              <Pressable style={styles.paxBtn} onPress={() => setPax((p) => Math.max(1, p - 1))}>
                <Ionicons name="remove" size={18} color={colors.text} />
              </Pressable>
              <Text style={styles.paxNum}>{pax}</Text>
              <Pressable style={styles.paxBtn} onPress={() => setPax((p) => Math.min(12, p + 1))}>
                <Ionicons name="add" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Denah meja (mengikuti modul reservasi office) */}
        <View style={styles.section}>
          <Text style={styles.label}>Pilih Meja</Text>
          <Text style={styles.mapHint}>Geser denah ke samping untuk melihat seluruh ruangan. Angka kecil = kapasitas kursi.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 4 }}>
            <View style={styles.map}>
              {/* Fixture: panggung, DJ, pintu masuk */}
              {layout.fixed.map((f, i) => {
                const st = FIXTURE_STYLE[f.t] || FIXTURE_STYLE.stage;
                return (
                  <View
                    key={'fx' + i}
                    style={[styles.fixture, { left: px(f.x), top: px(f.y), width: px(f.w), height: px(f.h), backgroundColor: st.bg }]}
                  >
                    <Text style={[styles.fixtureText, { color: st.fg }]}>{f.label}</Text>
                  </View>
                );
              })}

              {/* Meja */}
              {layout.tables.map((t) => {
                const z = ZONE[t.zone] || ZONE.blue;
                const chosen = tables.includes(t.id);
                const taken = takenSet.has(t.id);
                const light = z.light; // teks putih di atas zona gelap
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => toggleTable(t)}
                    style={[
                      styles.table,
                      {
                        left: px(t.x), top: px(t.y), width: px(t.w), height: px(t.h),
                        backgroundColor: z.color,
                        borderRadius: z.round ? px(Math.min(t.w, t.h)) / 2 : 8,
                      },
                      taken && styles.tableTaken,
                      chosen && styles.tableChosen,
                    ]}
                  >
                    <Text style={[styles.tableId, { color: light ? '#fff' : '#12233a' }]} numberOfLines={1}>{t.id}</Text>
                    {taken
                      ? <Ionicons name="close" size={px(Math.min(t.w, t.h)) * 0.4} color="#b3271a" />
                      : <Text style={[styles.tableCap, { color: light ? 'rgba(255,255,255,0.85)' : 'rgba(18,35,58,0.7)' }]}>{t.cap} org</Text>}
                    {chosen && !taken ? (
                      <View style={styles.chosenBadge}><Ionicons name="checkmark" size={11} color={colors.onGold} /></View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Legenda zona */}
          <View style={styles.legend}>
            {Object.values(ZONE).map((z) => (
              <View key={z.name} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: z.color, borderRadius: z.round ? 8 : 4 }]} />
                <Text style={styles.legendText}>{z.name}{z.fee ? ` · +${rupiah(z.fee)}` : ''}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.line }]} />
              <Text style={styles.legendText}>Terisi</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer DP */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footLabel}>{tables.length} meja dipilih · DP</Text>
          <Text style={styles.footDp}>{rupiah(dp)}</Text>
        </View>
        <GoldButton label="Lanjut Bayar DP" icon="arrow-forward" disabled={!canBook} onPress={() => setConfirm(true)} style={{ flex: 1.1 }} />
      </View>

      {/* Modal konfirmasi */}
      <Modal visible={confirm} transparent animationType="slide" onRequestClose={() => setConfirm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Konfirmasi Reservasi</Text>
          <View style={styles.recap}>
            <RecapRow icon="calendar" label="Tanggal" value={days[dayIdx].label} />
            <RecapRow icon="time" label="Jam" value={time} />
            <RecapRow icon="people" label="Jumlah" value={`${pax} orang`} />
            <RecapRow icon="grid" label="Meja" value={tables.join(', ')} />
            <Divider style={{ marginVertical: 10 }} />
            <View style={styles.dpRow}>
              <View>
                <Text style={styles.dpLabel}>DP (dipotong dari total tagihan)</Text>
                <Text style={styles.dpHint}>Sisa dibayar di gerai</Text>
              </View>
              <Text style={styles.dpValue}>{rupiah(dp)}</Text>
            </View>
          </View>
          <GoldButton label={`Bayar DP ${rupiah(dp)}`} icon="card" onPress={finalize} style={{ marginTop: 6 }} />
          <GhostButton label="Kembali" onPress={() => setConfirm(false)} style={{ marginTop: 10 }} />
        </View>
      </Modal>

      {/* Sukses */}
      <Modal visible={done} transparent animationType="fade">
        <View style={styles.doneWrap}>
          <View style={styles.doneCard}>
            <LinearGradient colors={gradients.gold} style={styles.doneIcon}>
              <Ionicons name="checkmark" size={44} color={colors.onGold} />
            </LinearGradient>
            <Text style={styles.doneTitle}>Reservasi Terkonfirmasi!</Text>
            <Text style={styles.doneSub}>{days[dayIdx].label}, {time}. Meja {tables.join(', ')}. Tunjukkan kode booking saat datang.</Text>
            <View style={styles.code}>
              <Text style={styles.codeLabel}>Kode Booking</Text>
              <Text style={styles.codeValue}>LM-RSV-882</Text>
            </View>
            <GoldButton label="Selesai" onPress={() => { setDone(false); navigation.navigate('Tabs', { screen: 'Beranda' }); }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RecapRow({ icon, label, value }) {
  return (
    <View style={styles.recapRow}>
      <Ionicons name={icon} size={16} color={colors.gold} />
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: 20, marginTop: 18 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  day: { width: 60, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 2 },
  dayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  // Hari lampau tetap BISA ditekan — cuma diredupkan. Lihat buildDays().
  dayLampau: { opacity: 0.45 },
  dayTeksLampau: { color: colors.muted },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold, marginTop: 2 },
  dayDow: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  dayNum: { color: colors.text, fontSize: 20, fontWeight: '900' },
  dayMon: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  // Tanpa marginBottom sendiri: styles.label di dalamnya sudah menyumbang 12.
  tglHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tglKini: { color: colors.gold, fontSize: 12.5, fontWeight: '800' },
  tglPilih: { color: colors.muted, fontSize: 12.5, fontWeight: '600', marginTop: 10 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: '30%', alignItems: 'center', paddingVertical: 13, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  slotOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  slotText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  paxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paxHint: { color: colors.muted, fontSize: 12 },
  paxBox: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 6 },
  paxBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  paxNum: { color: colors.text, fontSize: 18, fontWeight: '900', minWidth: 20, textAlign: 'center' },

  mapHint: { color: colors.muted, fontSize: 12, marginTop: -6, marginBottom: 12, lineHeight: 17 },
  map: { width: MAP_W, height: MAP_H, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.line, position: 'relative' },
  fixture: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 6, paddingHorizontal: 3 },
  fixtureText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  table: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.14)', padding: 2, overflow: 'visible' },
  tableId: { fontSize: 11, fontWeight: '900' },
  tableCap: { fontSize: 8, fontWeight: '700' },
  tableTaken: { opacity: 0.42 },
  tableChosen: { borderColor: colors.gold, borderWidth: 3 },
  chosenBadge: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 4 },
  legendText: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.line },
  footLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
  footDp: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: colors.line },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface3, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 16 },
  recap: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  recapLabel: { color: colors.muted, fontSize: 13.5, width: 70 },
  recapValue: { color: colors.text, fontSize: 13.5, fontWeight: '700', flex: 1, textAlign: 'right' },
  dpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dpLabel: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  dpHint: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  dpValue: { color: colors.gold, fontSize: 20, fontWeight: '900' },

  doneWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneCard: { backgroundColor: colors.bgElevated, borderRadius: 28, padding: 28, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.line },
  doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  doneSub: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  code: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 30, marginVertical: 18, borderWidth: 1, borderColor: colors.line },
  codeLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  codeValue: { color: colors.gold, fontSize: 24, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
});
