/*
  Layar "Reservasi (Server)" - menarik data reservasi ASLI dari database Office
  lewat api.php (baca saja). Ini bukti pipeline database -> API -> app jalan.

  Pola muat data: state {loading, error, rows}. Selalu tangani tiga keadaan
  (sedang memuat / gagal / kosong) supaya layar tidak pernah blank tanpa sebab.
*/
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { radius } from '../theme/typography';
import { Pill, GhostButton } from '../components/ui';
import { rupiah } from '../data/mockData';
import { getReservations } from '../data/api';
import ScreenHeader from '../components/ScreenHeader';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// "2026-08-27" -> "27 Agu 2026". Kalau formatnya tak terduga, tampilkan apa adanya.
function fmtTanggal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return s || '-';
  return `${+m[3]} ${BULAN[+m[2] - 1] || ''} ${m[1]}`;
}

function toneStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'datang') return 'ok';
  if (s === 'confirmed') return 'info';
  if (s === 'pending') return 'gold';
  return 'muted';
}

export default function ServerReservationsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  const muat = useCallback(async () => {
    setError(null);
    try {
      const data = await getReservations();
      setRows(data);
    } catch (e) {
      setError(e.message || 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const onRefresh = () => { setLoading(true); muat(); };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Reservasi (Server)" subtitle="Data asli dari database Office" onBack={() => navigation.goBack()} />

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.centerText}>Memuat dari server...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.muted2} />
          <Text style={styles.centerText}>{error}</Text>
          <Text style={styles.hint}>Cek API_BASE di src/config.js dan koneksi internet.</Text>
          <GhostButton label="Coba lagi" icon="refresh" onPress={onRefresh} style={{ marginTop: 14 }} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.gold} />}
          ListHeaderComponent={<Text style={styles.count}>{rows.length} reservasi</Text>}
          ListEmptyComponent={<Text style={styles.centerText}>Belum ada reservasi.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{fmtTanggal(item.tanggal).split(' ')[0]}</Text>
                <Text style={styles.dateMon}>{fmtTanggal(item.tanggal).split(' ')[1]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.topRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name || '(tanpa nama)'}</Text>
                  <Pill label={item.status || '-'} tone={toneStatus(item.status)} />
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={12} color={colors.muted} />
                  <Text style={styles.meta}>{item.jam || '-'}</Text>
                  <Ionicons name="people-outline" size={12} color={colors.muted} style={{ marginLeft: 8 }} />
                  <Text style={styles.meta}>{item.pax} orang</Text>
                  <Ionicons name="pricetag-outline" size={12} color={colors.muted} style={{ marginLeft: 8 }} />
                  <Text style={styles.meta} numberOfLines={1}>{item.source || '-'}</Text>
                </View>
                {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
                {Number(item.dp_amount) > 0 ? (
                  <Text style={styles.dp}>DP {rupiah(Number(item.dp_amount))}</Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  centerText: { color: colors.muted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  hint: { color: colors.muted2, fontSize: 12, textAlign: 'center', marginTop: 2 },
  count: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 12 },
  card: { flexDirection: 'row', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  dateBox: { width: 54, height: 60, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  dateDay: { color: colors.gold, fontSize: 22, fontWeight: '900' },
  dateMon: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '800', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, flexWrap: 'wrap' },
  meta: { color: colors.muted, fontSize: 11.5, fontWeight: '500' },
  phone: { color: colors.textDim, fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  dp: { color: colors.gold, fontSize: 13, fontWeight: '800', marginTop: 4 },
});
