import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { Pill } from '../components/ui';
import { menu, menuCategories, promos, rupiah } from '../data/mockData';

export default function OrderScreen({ navigation }) {
  const { cartCount, cartTotal, addToCart } = useApp();
  const [cat, setCat] = useState('Signature');
  const [mode, setMode] = useState('pickup'); // pickup | delivery

  const list = useMemo(() => menu.filter((m) => m.cat === cat), [cat]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>Menu</Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={13} color={colors.gold} />
            <Text style={styles.loc}>Laksamana Muda, Gerai Utama</Text>
          </View>
        </View>
        <Pressable style={styles.searchBtn}>
          <Ionicons name="search" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Mode pickup/delivery */}
      <View style={styles.modeRow}>
        {[['pickup', 'Ambil Sendiri', 'bag-handle'], ['delivery', 'Antar', 'bicycle']].map(([m, label, icon]) => (
          <Pressable key={m} style={[styles.modeBtn, mode === m && styles.modeOn]} onPress={() => setMode(m)}>
            <Ionicons name={icon} size={16} color={mode === m ? colors.onGold : colors.muted} />
            <Text style={[styles.modeText, mode === m && { color: colors.onGold }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Kategori */}
      <View>
        <FlatList
          data={menuCategories}
          horizontal
          keyExtractor={(i) => i}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <Pressable style={[styles.chip, cat === item && styles.chipOn]} onPress={() => setCat(item)}>
              <Text style={[styles.chipText, cat === item && { color: colors.onGold }]}>{item}</Text>
            </Pressable>
          )}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: cartCount ? 160 : 110 }}>
        {/* Promo strip */}
        {cat === 'Signature' && (
          <Pressable style={styles.promoStrip} onPress={() => navigation.navigate('Vouchers')}>
            <LinearGradient colors={gradients.goldDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.promoStripInner}>
              <Ionicons name="ticket" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.promoStripTitle}>{promos[0].title}</Text>
                <Text style={styles.promoStripSub}>Pakai voucher & kumpulkan poin tiap order</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}

        <View style={styles.list}>
          {list.map((item) => (
            <Pressable key={item.id} style={styles.item} onPress={() => navigation.navigate('ItemDetail', { id: item.id })}>
              <View style={styles.itemEmoji}><Text style={{ fontSize: 34 }}>{item.emoji}</Text></View>
              <View style={{ flex: 1 }}>
                {item.tag ? <Pill label={item.tag} tone="gold" style={{ marginBottom: 5 }} /> : null}
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDesc} numberOfLines={2}>{item.desc}</Text>
                <View style={styles.itemFoot}>
                  <Text style={styles.itemPrice}>{rupiah(item.price)}</Text>
                  <View style={styles.itemPoints}>
                    <Ionicons name="star" size={11} color={colors.gold} />
                    <Text style={styles.itemPointsText}>+{item.points}</Text>
                  </View>
                </View>
              </View>
              <Pressable style={styles.addBtn} onPress={() => addToCart(item)}>
                <Ionicons name="add" size={22} color={colors.onGold} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Bar keranjang */}
      {cartCount > 0 && (
        <Pressable style={styles.cartBar} onPress={() => navigation.navigate('Cart')}>
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cartBarInner}>
            <View style={styles.cartCountBox}><Text style={styles.cartCountText}>{cartCount}</Text></View>
            <Text style={styles.cartBarText}>Lihat Keranjang</Text>
            <Text style={styles.cartBarTotal}>{rupiah(cartTotal)}</Text>
          </LinearGradient>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  loc: { color: colors.muted, fontSize: 12.5, fontWeight: '500' },
  searchBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  modeOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  modeText: { color: colors.muted, fontSize: 13.5, fontWeight: '700' },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.textDim, fontSize: 13.5, fontWeight: '700' },

  promoStrip: { paddingHorizontal: 20, marginTop: 14 },
  promoStripInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  promoStripTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  promoStripSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 2 },

  list: { paddingHorizontal: 20, marginTop: 14, gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12 },
  itemEmoji: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  itemName: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  itemDesc: { color: colors.muted, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  itemFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  itemPrice: { color: colors.text, fontSize: 15, fontWeight: '800' },
  itemPoints: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.goldSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  itemPointsText: { color: colors.gold, fontSize: 11, fontWeight: '800' },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },

  cartBar: { position: 'absolute', left: 20, right: 20, bottom: 78 },
  cartBarInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 18, borderRadius: radius.md },
  cartCountBox: { backgroundColor: 'rgba(26,21,9,0.2)', minWidth: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  cartCountText: { color: colors.onGold, fontSize: 14, fontWeight: '800' },
  cartBarText: { color: colors.onGold, fontSize: 15, fontWeight: '800', flex: 1 },
  cartBarTotal: { color: colors.onGold, fontSize: 15, fontWeight: '800' },
});
