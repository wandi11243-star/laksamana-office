import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, Pill } from '../components/ui';
import ScreenHeader from '../components/ScreenHeader';

const SOURCE = {
  points: { label: 'Dari Poin', icon: 'star', color: colors.gold },
  tiktok: { label: 'TikTok', icon: 'logo-tiktok', color: '#25F4EE' },
  promo: { label: 'Promo', icon: 'megaphone', color: colors.violet },
};

export default function VouchersScreen({ navigation }) {
  const { vouchers, useVoucher } = useApp();
  const [code, setCode] = useState('');
  const active = vouchers.filter((v) => !v.used);
  const used = vouchers.filter((v) => v.used);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Voucher Saya" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Redeem code + connect */}
        <View style={styles.section}>
          <View style={styles.codeRow}>
            <View style={styles.codeInput}>
              <Ionicons name="pricetag-outline" size={18} color={colors.muted} />
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Masukkan kode voucher"
                placeholderTextColor={colors.muted2}
                style={styles.input}
                autoCapitalize="characters"
              />
            </View>
            <GoldButton small label="Klaim" onPress={() => setCode('')} />
          </View>
          <Pressable style={styles.connectBanner} onPress={() => navigation.navigate('Connections')}>
            <Ionicons name="logo-tiktok" size={20} color="#25F4EE" />
            <View style={{ flex: 1 }}>
              <Text style={styles.connectTitle}>Hubungkan TikTok</Text>
              <Text style={styles.connectSub}>Klaim voucher dari live & dapat reward follow</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted2} />
          </Pressable>
        </View>

        {/* Voucher aktif */}
        <View style={styles.section}>
          <Text style={styles.secTitle}>Voucher Aktif ({active.length})</Text>
          {active.map((v) => {
            const s = SOURCE[v.source];
            return (
              <View key={v.id} style={styles.ticket}>
                <View style={styles.ticketLeft}>
                  <View style={[styles.ticketIcon, { backgroundColor: colors.surface2 }]}>
                    <Ionicons name={s.icon} size={22} color={s.color} />
                  </View>
                </View>
                <View style={styles.notchTop} />
                <View style={styles.notchBottom} />
                <View style={styles.ticketBody}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.ticketTitle}>{v.title}</Text>
                  </View>
                  <Text style={styles.ticketSub}>{v.sub}</Text>
                  <View style={styles.ticketFoot}>
                    <Pill label={s.label} tone={v.source === 'points' ? 'gold' : v.source === 'tiktok' ? 'info' : 'violet'} />
                    <Text style={styles.ticketExp}>s/d {v.exp}</Text>
                  </View>
                </View>
                <Pressable style={styles.usePill} onPress={() => useVoucher(v.id)}>
                  <Text style={styles.usePillText}>Pakai</Text>
                </Pressable>
              </View>
            );
          })}
          {active.length === 0 && <Text style={styles.empty}>Belum ada voucher aktif.</Text>}
        </View>

        {used.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.secTitle}>Terpakai</Text>
            {used.map((v) => (
              <View key={v.id} style={[styles.ticket, { opacity: 0.5 }]}>
                <View style={styles.ticketBody}>
                  <Text style={styles.ticketTitle}>{v.title}</Text>
                  <Text style={styles.ticketSub}>{v.sub}</Text>
                </View>
                <Pill label="Terpakai" tone="muted" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: 20, marginTop: 14 },
  codeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 48 },
  input: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  connectBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginTop: 12 },
  connectTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  connectSub: { color: colors.muted, fontSize: 12, marginTop: 2 },

  secTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  ticket: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginBottom: 12, gap: 12, overflow: 'hidden' },
  ticketLeft: {},
  ticketIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ticketBody: { flex: 1 },
  ticketTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  ticketSub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  ticketFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  ticketExp: { color: colors.muted2, fontSize: 11, fontWeight: '600' },
  usePill: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldSoftBorder, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  usePillText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  notchTop: { position: 'absolute', left: 66, top: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.bg },
  notchBottom: { position: 'absolute', left: 66, bottom: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.bg },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
});
