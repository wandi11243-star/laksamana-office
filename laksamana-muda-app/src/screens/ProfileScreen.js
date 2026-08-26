import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { Pill } from '../components/ui';

const MENU = [
  { key: 'connections', icon: 'link', label: 'Koneksi Akun', sub: 'TikTok, GoFood, Instagram', to: 'Connections' },
  { key: 'vouchers', icon: 'pricetag', label: 'Voucher Saya', sub: 'Voucher aktif & terpakai', to: 'Vouchers' },
  { key: 'rewards', icon: 'gift', label: 'Tukar Poin', sub: 'Katalog reward', to: 'RewardCatalog' },
];

export default function ProfileScreen({ navigation }) {
  const { user, points, reservations, tickets, logout } = useApp();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.head}>
          <Text style={styles.title}>Profil</Text>
          <Pressable style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Kartu profil */}
        <View style={styles.section}>
          <LinearGradient colors={gradients.card} style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.avatarInitial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.phone}>{user.phone}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Pill label={`Member ${user.tier}`} tone="gold" />
                {user.role && user.role !== 'Member' ? <Pill label={user.role} tone="violet" /> : null}
                <Pill label={user.memberId} tone="muted" />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Stat */}
        <View style={[styles.section, styles.statRow]}>
          <Stat icon="star" value={points.toLocaleString('id-ID')} label="Poin" />
          <Stat icon="calendar" value={reservations.length} label="Reservasi" />
          <Stat icon="ticket" value={tickets.length} label="Tiket" />
        </View>

        {/* Menu */}
        <View style={styles.section}>
          {MENU.map((m, i) => (
            <Pressable key={m.key} style={[styles.menuItem, i < MENU.length - 1 && styles.menuBorder]} onPress={() => navigation.navigate(m.to)}>
              <View style={styles.menuIcon}><Ionicons name={m.icon} size={19} color={colors.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{m.label}</Text>
                <Text style={styles.menuSub}>{m.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={colors.muted2} />
            </Pressable>
          ))}
        </View>

        {/* Reservasi aktif */}
        {reservations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.secTitle}>Reservasi Kamu</Text>
            {reservations.map((r) => (
              <View key={r.id} style={styles.resvCard}>
                <View style={styles.resvIcon}><Ionicons name="calendar" size={18} color={colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resvTitle}>{r.date} · {r.time}</Text>
                  <Text style={styles.resvSub}>Meja {r.seats.join(', ')} · {r.pax} orang</Text>
                </View>
                <Pill label="Terbayar DP" tone="ok" />
              </View>
            ))}
          </View>
        )}

        {/* Tiket aktif */}
        {tickets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.secTitle}>Tiket Event</Text>
            {tickets.map((t) => (
              <View key={t.id} style={styles.resvCard}>
                <View style={styles.resvIcon}><Ionicons name="ticket" size={18} color={colors.gold} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resvTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.resvSub}>{t.date} · {t.qty} tiket</Text>
                </View>
                <Ionicons name="qr-code" size={26} color={colors.textDim} />
              </View>
            ))}
          </View>
        )}

        {/* Keluar */}
        <View style={styles.section}>
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={19} color={colors.danger} />
            <Text style={styles.logoutText}>Keluar</Text>
          </Pressable>
        </View>

        {/* Info bar */}
        <View style={styles.section}>
          <View style={styles.about}>
            <Text style={styles.aboutBrand}>LAKSAMANA MUDA</Text>
            <Text style={styles.aboutSub}>Coffee & Live Space</Text>
            <Text style={styles.aboutVer}>Versi 1.0.0 · Prototype</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, value, label }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.gold} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 20, marginTop: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.xl, padding: 18, borderWidth: 1, borderColor: colors.line },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onGold, fontSize: 28, fontWeight: '900' },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  phone: { color: colors.muted, fontSize: 13, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, backgroundColor: colors.surface, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, marginBottom: 10 },
  menuBorder: {},
  menuIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  menuSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  secTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  resvCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  resvIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  resvTitle: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  resvSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: radius.md, paddingVertical: 15 },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  about: { alignItems: 'center', paddingVertical: 20 },
  aboutBrand: { color: colors.gold, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  aboutSub: { color: colors.muted, fontSize: 12, letterSpacing: 1, marginTop: 3 },
  aboutVer: { color: colors.muted2, fontSize: 11, marginTop: 10 },
});
