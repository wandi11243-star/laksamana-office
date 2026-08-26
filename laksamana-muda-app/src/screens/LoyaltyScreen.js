import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius, shadow } from '../theme/typography';
import { Card, SectionHeader, GoldButton, GhostButton, Pill } from '../components/ui';
import { tiers, rewards, pointHistory } from '../data/mockData';

export default function LoyaltyScreen({ navigation }) {
  const { user, points } = useApp();
  const next = user.nextTierAt;
  const pct = Math.min(100, Math.round((points / next) * 100));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.head}>
          <Text style={styles.title}>Poin & Loyalty</Text>
          <Pressable style={styles.histBtn} onPress={() => navigation.navigate('Vouchers')}>
            <Ionicons name="pricetag-outline" size={18} color={colors.gold} />
          </Pressable>
        </View>

        {/* Saldo poin */}
        <View style={styles.section}>
          <LinearGradient colors={gradients.card} style={styles.balance}>
            <View style={styles.balanceTop}>
              <View>
                <Text style={styles.balanceLabel}>Total Poin</Text>
                <Text style={styles.balanceValue}>{points.toLocaleString('id-ID')}</Text>
              </View>
              <View style={styles.starWrap}>
                <LinearGradient colors={gradients.gold} style={styles.starCircle}>
                  <Ionicons name="star" size={26} color={colors.onGold} />
                </LinearGradient>
              </View>
            </View>
            <View style={styles.balanceBtns}>
              <GoldButton small label="Tukar Poin" icon="gift" style={{ flex: 1 }} onPress={() => navigation.navigate('RewardCatalog')} />
              <GhostButton small label="Cara dapat poin" style={{ flex: 1 }} onPress={() => {}} />
            </View>
          </LinearGradient>
        </View>

        {/* Tier progress */}
        <View style={styles.section}>
          <Card>
            <View style={styles.tierHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
                <Text style={styles.tierNow}>Member {user.tier}</Text>
              </View>
              <Text style={styles.tierNext}>{next - points} poin lagi ke {user.nextTier}</Text>
            </View>
            <View style={styles.track}>
              <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.trackFill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.tierScale}>
              {tiers.map((t) => (
                <View key={t.name} style={styles.tierPoint}>
                  <View style={[styles.tierDot, points >= t.min && styles.tierDotOn]} />
                  <Text style={[styles.tierPointLabel, points >= t.min && { color: colors.gold }]}>{t.name}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Keuntungan tier */}
        <View style={styles.section}>
          <SectionHeader title="Keuntungan Tier" />
          {tiers.map((t) => {
            const active = user.tier === t.name;
            return (
              <View key={t.name} style={[styles.perkRow, active && styles.perkActive]}>
                <View style={[styles.perkIcon, active && { backgroundColor: colors.gold }]}>
                  <Ionicons name="ribbon" size={16} color={active ? colors.onGold : colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.perkName, active && { color: colors.gold }]}>{t.name}</Text>
                    {active && <Pill label="Tier kamu" tone="gold" />}
                  </View>
                  <Text style={styles.perkText}>{t.perk}</Text>
                </View>
                <Text style={styles.perkMin}>{t.min}+</Text>
              </View>
            );
          })}
        </View>

        {/* Reward populer */}
        <View style={styles.section}>
          <SectionHeader title="Reward Populer" actionLabel="Semua reward" onAction={() => navigation.navigate('RewardCatalog')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {rewards.slice(0, 4).map((r) => (
              <Pressable key={r.id} onPress={() => navigation.navigate('RewardCatalog')}>
                <View style={styles.rewardMini}>
                  <Text style={{ fontSize: 34 }}>{r.emoji}</Text>
                  <Text style={styles.rewardName} numberOfLines={2}>{r.title}</Text>
                  <View style={styles.rewardCost}>
                    <Ionicons name="star" size={12} color={colors.gold} />
                    <Text style={styles.rewardCostText}>{r.cost}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Riwayat poin */}
        <View style={styles.section}>
          <SectionHeader title="Riwayat Poin" />
          <Card style={{ padding: 6 }}>
            {pointHistory.map((h, i) => (
              <View key={h.id} style={[styles.histRow, i < pointHistory.length - 1 && styles.histBorder]}>
                <View style={[styles.histIcon, { backgroundColor: h.type === 'redeem' ? colors.dangerBg : h.type === 'bonus' ? colors.violetBg : colors.okBg }]}>
                  <Ionicons
                    name={h.type === 'redeem' ? 'arrow-up' : h.type === 'bonus' ? 'gift' : 'arrow-down'}
                    size={15}
                    color={h.type === 'redeem' ? colors.danger : h.type === 'bonus' ? colors.violet : colors.ok}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histTitle}>{h.title}</Text>
                  <Text style={styles.histDate}>{h.date}</Text>
                </View>
                <Text style={[styles.histPoints, { color: h.points.startsWith('-') ? colors.danger : colors.ok }]}>{h.points}</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  histBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 20, marginTop: 18 },

  balance: { borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.line },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  balanceValue: { color: colors.gold, fontSize: 40, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  starWrap: {},
  starCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  balanceBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },

  tierHead: { marginBottom: 14 },
  tierNow: { color: colors.text, fontSize: 16, fontWeight: '800' },
  tierNext: { color: colors.muted, fontSize: 12.5, marginTop: 4 },
  track: { height: 10, borderRadius: 6, backgroundColor: colors.surface2, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 6 },
  tierScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  tierPoint: { alignItems: 'center', gap: 4 },
  tierDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface3 },
  tierDotOn: { backgroundColor: colors.gold },
  tierPointLabel: { color: colors.muted2, fontSize: 10, fontWeight: '700' },

  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, marginBottom: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  perkActive: { borderColor: colors.goldSoftBorder, backgroundColor: colors.goldSoft },
  perkIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  perkName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  perkText: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  perkMin: { color: colors.muted2, fontSize: 12, fontWeight: '700' },

  rewardMini: { width: 130, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  rewardName: { color: colors.text, fontSize: 13, fontWeight: '700', minHeight: 34 },
  rewardCost: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.goldSoft, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rewardCostText: { color: colors.gold, fontSize: 12, fontWeight: '800' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10 },
  histBorder: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  histIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  histTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  histDate: { color: colors.muted2, fontSize: 11.5, marginTop: 2 },
  histPoints: { fontSize: 15, fontWeight: '800' },
});
