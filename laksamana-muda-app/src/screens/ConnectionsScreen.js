import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import { radius } from '../theme/typography';
import ScreenHeader from '../components/ScreenHeader';

const ICONMAP = {
  tiktok: 'logo-tiktok',
  gofood: 'bicycle',
  grabfood: 'car',
  instagram: 'logo-instagram',
};

export default function ConnectionsScreen({ navigation }) {
  const { connections, toggleConnection } = useApp();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Koneksi Akun" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.section}>
          <Text style={styles.intro}>
            Hubungkan akun untuk klaim voucher, dapat reward, dan pastikan poin tetap masuk saat pesan lewat aplikasi lain.
          </Text>
        </View>

        <View style={styles.section}>
          {connections.map((c) => (
            <View key={c.id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: colors.surface2 }]}>
                <Ionicons name={ICONMAP[c.id] || 'link'} size={22} color={c.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.sub}>{c.sub}</Text>
              </View>
              <Pressable
                style={[styles.btn, c.connected ? styles.btnOn : styles.btnOff]}
                onPress={() => toggleConnection(c.id)}
              >
                <Text style={[styles.btnText, c.connected ? { color: colors.ok } : { color: colors.onGold }]}>
                  {c.connected ? 'Terhubung' : 'Hubungkan'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.tiktokCard}>
            <Ionicons name="logo-tiktok" size={26} color="#25F4EE" />
            <Text style={styles.tiktokTitle}>Live Shopping Laksamana Muda</Text>
            <Text style={styles.tiktokSub}>Follow @laksamanamuda dan aktifkan notifikasi. Setiap live, ada kode voucher yang otomatis masuk ke akun kamu saat TikTok terhubung.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: 20, marginTop: 14 },
  intro: { color: colors.muted, fontSize: 13.5, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  btnOn: { backgroundColor: colors.okBg, borderWidth: 1, borderColor: 'transparent' },
  btnOff: { backgroundColor: colors.gold },
  btnText: { fontSize: 13, fontWeight: '800' },
  tiktokCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 18, gap: 8 },
  tiktokTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  tiktokSub: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
