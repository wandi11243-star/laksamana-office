import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, Pill } from '../components/ui';
import { menu, rupiah } from '../data/mockData';
import ScreenHeader from '../components/ScreenHeader';

const SIZES = [
  { key: 'Reguler', add: 0 },
  { key: 'Large', add: 6000 },
];
const EXTRAS = [
  { key: 'Extra Shot', add: 8000 },
  { key: 'Oat Milk', add: 6000 },
  { key: 'Less Sugar', add: 0 },
];

export default function ItemDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const item = menu.find((m) => m.id === id);
  const { addToCart, cartCount, cartTotal } = useApp();
  const [size, setSize] = useState('Reguler');
  const [extras, setExtras] = useState([]);
  const [qty, setQty] = useState(1);

  // Menu tidak ketemu (mis. data kosong). Jaga-jaga supaya tidak crash.
  if (!item) return null;

  const sizeAdd = SIZES.find((s) => s.key === size)?.add || 0;
  const extraAdd = extras.reduce((s, e) => s + (EXTRAS.find((x) => x.key === e)?.add || 0), 0);
  const unit = item.price + sizeAdd + extraAdd;
  const total = unit * qty;

  const toggleExtra = (k) => setExtras((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Detail Menu" onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 96 }}>{item.emoji}</Text>
        </View>
        <View style={styles.body}>
          {item.tag ? <Pill label={item.tag} tone="gold" /> : null}
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.desc}>{item.desc}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{rupiah(item.price)}</Text>
            <View style={styles.pointsPill}>
              <Ionicons name="star" size={13} color={colors.gold} />
              <Text style={styles.pointsText}>Dapat +{item.points} poin</Text>
            </View>
          </View>

          <Text style={styles.groupTitle}>Ukuran</Text>
          <View style={styles.optRow}>
            {SIZES.map((s) => (
              <Pressable key={s.key} style={[styles.opt, size === s.key && styles.optOn]} onPress={() => setSize(s.key)}>
                <Text style={[styles.optText, size === s.key && { color: colors.gold }]}>{s.key}</Text>
                {s.add > 0 && <Text style={styles.optAdd}>+{rupiah(s.add)}</Text>}
              </Pressable>
            ))}
          </View>

          <Text style={styles.groupTitle}>Tambahan</Text>
          <View style={styles.optWrap}>
            {EXTRAS.map((e) => {
              const on = extras.includes(e.key);
              return (
                <Pressable key={e.key} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleExtra(e.key)}>
                  <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={16} color={on ? colors.gold : colors.muted} />
                  <Text style={[styles.chipText, on && { color: colors.gold }]}>{e.key}</Text>
                  {e.add > 0 && <Text style={styles.chipAdd}>+{(e.add / 1000)}k</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Footer add to cart */}
      <View style={styles.footer}>
        <View style={styles.qtyBox}>
          <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
            <Ionicons name="remove" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.qtyNum}>{qty}</Text>
          <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)}>
            <Ionicons name="add" size={18} color={colors.text} />
          </Pressable>
        </View>
        <GoldButton
          label={`Tambah · ${rupiah(total)}`}
          icon="bag-add"
          style={{ flex: 1 }}
          onPress={() => { addToCart({ ...item, price: unit }, qty, size); navigation.goBack(); }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { height: 220, backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  body: { paddingHorizontal: 20, marginTop: 20 },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  desc: { color: colors.muted, fontSize: 14.5, marginTop: 6, lineHeight: 21 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  price: { color: colors.text, fontSize: 22, fontWeight: '900' },
  pointsPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.goldSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  pointsText: { color: colors.gold, fontSize: 12.5, fontWeight: '700' },
  groupTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  optRow: { flexDirection: 'row', gap: 10 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line, gap: 3 },
  optOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  optText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  optAdd: { color: colors.muted, fontSize: 12 },
  optWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  chipOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  chipText: { color: colors.textDim, fontSize: 13.5, fontWeight: '700' },
  chipAdd: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.line },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 8, height: 52 },
  qtyBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  qtyNum: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 18, textAlign: 'center' },
});
