import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, GhostButton, Pill, Divider } from '../components/ui';
import { events, rupiah } from '../data/mockData';
import ScreenHeader from '../components/ScreenHeader';

export default function EventDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const ev = events.find((e) => e.id === id);
  const { user, addTicket } = useApp();
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);

  const isFree = ev.price === 0;
  const isMember = user.tier === 'Gold' || user.tier === 'Platinum';
  const unit = isMember ? ev.memberPrice : ev.price;
  const total = unit * qty;

  const book = () => {
    addTicket({ title: ev.title, date: ev.dateLabel, time: ev.time, qty, total });
    setDone(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Detail Event" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
        <View style={styles.section}>
          <LinearGradient colors={['#3A2E5E', '#1A1330']} style={styles.hero}>
            <Text style={{ fontSize: 76 }}>{ev.emoji}</Text>
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Pill label={ev.tag} tone={isFree ? 'ok' : 'gold'} />
          <Text style={styles.title}>{ev.title}</Text>

          <View style={styles.infoGrid}>
            <Info icon="calendar" label="Tanggal" value={ev.dateLabel} />
            <Info icon="time" label="Waktu" value={ev.time} />
            <Info icon="location" label="Lokasi" value={ev.location} />
            <Info icon="people" label="Sisa" value={`${ev.left} kursi`} />
          </View>

          <Text style={styles.descTitle}>Tentang Event</Text>
          <Text style={styles.desc}>{ev.desc}</Text>

          {!isFree && isMember && (
            <View style={styles.memberBanner}>
              <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
              <Text style={styles.memberText}>Harga khusus Member {user.tier}: {rupiah(ev.memberPrice)} (normal {rupiah(ev.price)})</Text>
            </View>
          )}

          {!isFree && (
            <>
              <Divider />
              <View style={styles.qtyRow}>
                <View>
                  <Text style={styles.qtyLabel}>Jumlah Tiket</Text>
                  <Text style={styles.qtyPrice}>{rupiah(unit)} / tiket</Text>
                </View>
                <View style={styles.qtyBox}>
                  <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </Pressable>
                  <Text style={styles.qtyNum}>{qty}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.min(ev.left, q + 1))}>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footLabel}>{isFree ? 'Masuk' : 'Total'}</Text>
          <Text style={styles.footValue}>{isFree ? 'Gratis' : rupiah(total)}</Text>
        </View>
        <GoldButton label={isFree ? 'RSVP Sekarang' : 'Beli Tiket'} icon={isFree ? 'checkmark-circle' : 'ticket'} onPress={book} style={{ flex: 1.2 }} />
      </View>

      {/* E-ticket sukses */}
      <Modal visible={done} transparent animationType="fade">
        <View style={styles.doneWrap}>
          <View style={styles.ticketCard}>
            <LinearGradient colors={gradients.gold} style={styles.doneIcon}>
              <Ionicons name="checkmark" size={40} color={colors.onGold} />
            </LinearGradient>
            <Text style={styles.doneTitle}>{isFree ? 'RSVP Berhasil!' : 'Tiket Terbeli!'}</Text>
            <View style={styles.eticket}>
              <Text style={styles.etTitle}>{ev.title}</Text>
              <Text style={styles.etMeta}>{ev.dateLabel} · {ev.time}</Text>
              <View style={styles.etDivider} />
              <View style={styles.etRow}>
                <View>
                  <Text style={styles.etLabel}>Atas Nama</Text>
                  <Text style={styles.etValue}>{user.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.etLabel}>Jumlah</Text>
                  <Text style={styles.etValue}>{isFree ? '1 orang' : `${qty} tiket`}</Text>
                </View>
              </View>
              <View style={styles.qrBox}>
                <Ionicons name="qr-code" size={72} color={colors.ink || '#1A1509'} />
                <Text style={styles.qrCode}>LM-EVT-{ev.id.toUpperCase()}0{qty}</Text>
              </View>
            </View>
            <GoldButton label="Selesai" onPress={() => { setDone(false); navigation.navigate('Tabs', { screen: 'Event' }); }} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Info({ icon, label, value }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={16} color={colors.gold} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: 20, marginTop: 14 },
  hero: { height: 190, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 10, letterSpacing: -0.5 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '47%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 1 },
  descTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 8 },
  desc: { color: colors.textDim, fontSize: 14.5, lineHeight: 22 },
  memberBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldSoftBorder, borderRadius: radius.md, padding: 14, marginTop: 16 },
  memberText: { color: colors.gold, fontSize: 13, fontWeight: '700', flex: 1, lineHeight: 18 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
  qtyPrice: { color: colors.muted, fontSize: 13, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 6 },
  qtyBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { color: colors.text, fontSize: 17, fontWeight: '900', minWidth: 20, textAlign: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.line },
  footLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },
  footValue: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 2 },

  doneWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  ticketCard: { backgroundColor: colors.bgElevated, borderRadius: 28, padding: 24, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.line },
  doneIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 14, marginBottom: 16 },
  eticket: { width: '100%', backgroundColor: colors.gold, borderRadius: radius.lg, padding: 18 },
  etTitle: { color: colors.onGold, fontSize: 17, fontWeight: '900' },
  etMeta: { color: 'rgba(26,21,9,0.75)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  etDivider: { height: 1, backgroundColor: 'rgba(26,21,9,0.2)', marginVertical: 14 },
  etRow: { flexDirection: 'row', justifyContent: 'space-between' },
  etLabel: { color: 'rgba(26,21,9,0.7)', fontSize: 11, fontWeight: '700' },
  etValue: { color: colors.onGold, fontSize: 14, fontWeight: '800', marginTop: 2 },
  qrBox: { backgroundColor: '#fff', borderRadius: radius.md, alignItems: 'center', padding: 16, marginTop: 16, gap: 8 },
  qrCode: { color: '#1A1509', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
});
