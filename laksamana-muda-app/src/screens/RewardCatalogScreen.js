import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, GhostButton } from '../components/ui';
import { rewards } from '../data/mockData';
import ScreenHeader from '../components/ScreenHeader';

export default function RewardCatalogScreen({ navigation }) {
  const { points, redeemReward } = useApp();
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);

  const handleRedeem = () => {
    const ok = redeemReward(selected);
    if (ok) setDone(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Tukar Poin" onBack={() => navigation.goBack()} right={
        <View style={styles.pointsChip}>
          <Ionicons name="star" size={14} color={colors.gold} />
          <Text style={styles.pointsChipText}>{points.toLocaleString('id-ID')}</Text>
        </View>
      } />

      <FlatList
        data={rewards}
        keyExtractor={(i) => i.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 8 }}
        renderItem={({ item }) => {
          const afford = points >= item.cost;
          return (
            <Pressable style={[styles.card, !afford && { opacity: 0.55 }]} onPress={() => { setSelected(item); setDone(false); }}>
              <View style={styles.emojiBox}><Text style={{ fontSize: 40 }}>{item.emoji}</Text></View>
              <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
              <View style={styles.costRow}>
                <View style={styles.cost}>
                  <Ionicons name="star" size={12} color={colors.gold} />
                  <Text style={styles.costText}>{item.cost}</Text>
                </View>
                {afford ? <Text style={styles.avail}>Tersedia</Text> : <Text style={styles.lack}>Kurang {item.cost - points}</Text>}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Modal konfirmasi */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)} />
        <View style={styles.sheet}>
          {!done ? (
            <>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetEmoji}><Text style={{ fontSize: 52 }}>{selected?.emoji}</Text></View>
              <Text style={styles.sheetTitle}>{selected?.title}</Text>
              <Text style={styles.sheetSub}>Tukar dengan {selected?.cost} poin?</Text>
              <View style={styles.sheetBalance}>
                <Text style={styles.sheetBalanceLabel}>Poin setelah tukar</Text>
                <Text style={styles.sheetBalanceValue}>{selected ? (points - selected.cost).toLocaleString('id-ID') : ''}</Text>
              </View>
              <GoldButton
                label={points >= (selected?.cost || 0) ? 'Tukar Sekarang' : 'Poin tidak cukup'}
                icon="gift"
                disabled={points < (selected?.cost || 0)}
                onPress={handleRedeem}
                style={{ marginTop: 6 }}
              />
              <GhostButton label="Batal" onPress={() => setSelected(null)} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <View style={styles.sheetHandle} />
              <LinearGradient colors={gradients.gold} style={styles.successIcon}>
                <Ionicons name="checkmark" size={40} color={colors.onGold} />
              </LinearGradient>
              <Text style={styles.sheetTitle}>Berhasil ditukar!</Text>
              <Text style={styles.sheetSub}>Voucher {selected?.title} masuk ke halaman Voucher kamu. Tunjukkan ke barista untuk klaim.</Text>
              <GoldButton label="Lihat Voucher" icon="pricetag" onPress={() => { setSelected(null); navigation.navigate('Vouchers'); }} style={{ marginTop: 10 }} />
              <GhostButton label="Tutup" onPress={() => setSelected(null)} style={{ marginTop: 10 }} />
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pointsChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldSoftBorder, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  pointsChipText: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  emojiBox: { height: 72, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderRadius: radius.md },
  name: { color: colors.text, fontSize: 14, fontWeight: '700', minHeight: 36 },
  costRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.goldSoft, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  costText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  avail: { color: colors.ok, fontSize: 11, fontWeight: '700' },
  lack: { color: colors.muted2, fontSize: 11, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, alignItems: 'center', borderTopWidth: 1, borderColor: colors.line },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface3, marginBottom: 18 },
  sheetEmoji: { width: 92, height: 92, borderRadius: 24, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  sheetSub: { color: colors.muted, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  sheetBalance: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginTop: 18, marginBottom: 4, borderWidth: 1, borderColor: colors.line },
  sheetBalanceLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  sheetBalanceValue: { color: colors.gold, fontSize: 18, fontWeight: '800' },
});
