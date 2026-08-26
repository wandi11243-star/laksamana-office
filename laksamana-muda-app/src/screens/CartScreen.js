import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, GhostButton, Divider } from '../components/ui';
import { rupiah } from '../data/mockData';
import ScreenHeader from '../components/ScreenHeader';

export default function CartScreen({ navigation }) {
  const { cart, updateQty, cartTotal, cartPoints, checkout, vouchers } = useApp();
  const [voucher, setVoucher] = useState(null);
  const [done, setDone] = useState(false);

  const discount = voucher ? 20000 : 0;
  const tax = Math.round((cartTotal - discount) * 0.11);
  const grand = Math.max(0, cartTotal - discount + tax);
  const activeVouchers = vouchers.filter((v) => !v.used && v.source !== 'tiktok');

  if (cart.length === 0 && !done) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Keranjang" onBack={() => navigation.goBack()} />
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={56} color={colors.muted2} />
          <Text style={styles.emptyText}>Keranjang masih kosong</Text>
          <GoldButton label="Mulai Pesan" icon="cafe" onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Keranjang" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 200 }}>
        {/* Item */}
        <View style={styles.section}>
          {cart.map((c) => (
            <View key={c.key} style={styles.item}>
              <View style={styles.itemEmoji}><Text style={{ fontSize: 28 }}>{c.item.emoji}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{c.item.name}</Text>
                <Text style={styles.itemSize}>{c.size}</Text>
                <Text style={styles.itemPrice}>{rupiah(c.item.price)}</Text>
              </View>
              <View style={styles.qtyBox}>
                <Pressable style={styles.qtyBtn} onPress={() => updateQty(c.key, -1)}>
                  <Ionicons name="remove" size={16} color={colors.text} />
                </Pressable>
                <Text style={styles.qtyNum}>{c.qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => updateQty(c.key, 1)}>
                  <Ionicons name="add" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {/* Voucher */}
        <View style={styles.section}>
          <Text style={styles.secTitle}>Voucher & Promo</Text>
          {activeVouchers.length > 0 ? (
            <View style={{ gap: 8 }}>
              {activeVouchers.map((v) => (
                <Pressable key={v.id} style={[styles.voucher, voucher?.id === v.id && styles.voucherOn]} onPress={() => setVoucher(voucher?.id === v.id ? null : v)}>
                  <Ionicons name="ticket" size={20} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.voucherTitle}>{v.title}</Text>
                    <Text style={styles.voucherSub}>{v.sub}</Text>
                  </View>
                  <Ionicons name={voucher?.id === v.id ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={voucher?.id === v.id ? colors.gold : colors.muted2} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.noVoucher}>Belum ada voucher yang bisa dipakai.</Text>
          )}
        </View>

        {/* Ringkasan */}
        <View style={styles.section}>
          <View style={styles.summary}>
            <Row label="Subtotal" value={rupiah(cartTotal)} />
            {discount > 0 && <Row label="Diskon voucher" value={`- ${rupiah(discount)}`} valueColor={colors.ok} />}
            <Row label="Pajak 11%" value={rupiah(tax)} />
            <Divider style={{ marginVertical: 10 }} />
            <Row label="Total" value={rupiah(grand)} bold />
            <View style={styles.earnRow}>
              <Ionicons name="star" size={14} color={colors.gold} />
              <Text style={styles.earnText}>Kamu akan dapat +{cartPoints} poin</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer bayar */}
      <View style={styles.footer}>
        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Total bayar</Text>
          <Text style={styles.payValue}>{rupiah(grand)}</Text>
        </View>
        <GoldButton label="Bayar Sekarang" icon="card" onPress={() => { checkout(); setDone(true); }} />
      </View>

      {/* Sukses */}
      <Modal visible={done} transparent animationType="fade">
        <View style={styles.doneWrap}>
          <View style={styles.doneCard}>
            <LinearGradient colors={gradients.gold} style={styles.doneIcon}>
              <Ionicons name="checkmark" size={44} color={colors.onGold} />
            </LinearGradient>
            <Text style={styles.doneTitle}>Pesanan diterima!</Text>
            <Text style={styles.doneSub}>Poin +{cartPoints} sudah masuk. Barista sedang menyiapkan pesananmu. Tunjukkan nomor antrian di gerai.</Text>
            <View style={styles.orderNo}>
              <Text style={styles.orderNoLabel}>No. Antrian</Text>
              <Text style={styles.orderNoValue}>A-24</Text>
            </View>
            <GoldButton label="Selesai" onPress={() => { setDone(false); navigation.navigate('Tabs', { screen: 'Beranda' }); }} style={{ marginTop: 4 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, valueColor }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && { color: colors.text, fontWeight: '800', fontSize: 16 }]}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontSize: 18, fontWeight: '900' }, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.muted, fontSize: 15, fontWeight: '600', marginTop: 8 },
  section: { paddingHorizontal: 20, marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  itemEmoji: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  itemSize: { color: colors.muted, fontSize: 12, marginTop: 1 },
  itemPrice: { color: colors.gold, fontSize: 14, fontWeight: '800', marginTop: 4 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 10, padding: 4 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { color: colors.text, fontSize: 15, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  secTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  voucher: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: 14 },
  voucherOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  voucherTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  voucherSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  noVoucher: { color: colors.muted, fontSize: 13 },
  summary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.goldSoft, borderRadius: 10, padding: 10, marginTop: 12 },
  earnText: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.line, gap: 12 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payLabel: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  payValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  doneWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneCard: { backgroundColor: colors.bgElevated, borderRadius: 28, padding: 28, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: colors.line },
  doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 18 },
  doneSub: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  orderNo: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 40, marginTop: 18, marginBottom: 18, borderWidth: 1, borderColor: colors.line },
  orderNoLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  orderNoValue: { color: colors.gold, fontSize: 28, fontWeight: '900', letterSpacing: 1 },
});
