import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius, shadow } from '../theme/typography';
import { Card, Pill, SectionHeader, GoldButton, Wordmark } from '../components/ui';
import { promos, events, rupiah } from '../data/mockData';

const QUICK = [
  { key: 'order', label: 'Pesan', icon: 'cafe', to: ['Menu'] },
  { key: 'reserve', label: 'Reservasi', icon: 'calendar', to: ['Reservation'] },
  { key: 'redeem', label: 'Tukar Poin', icon: 'gift', to: ['RewardCatalog'] },
  { key: 'voucher', label: 'Voucher', icon: 'pricetag', to: ['Vouchers'] },
];

export default function HomeScreen({ navigation }) {
  const { user, points, stampCount, stampGoal, cartCount } = useApp();

  const go = (to) => {
    if (to[0] === 'Menu') navigation.navigate('Tabs', { screen: 'Menu' });
    else navigation.navigate(to[0]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Selamat datang,</Text>
            <Text style={styles.name}>{user.name.split(' ')[0]} 👋</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              <View style={styles.notifDot} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Cart')}>
              <Ionicons name="bag-outline" size={22} color={colors.text} />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Kartu Member */}
        <View style={styles.section}>
          <MemberCard user={user} points={points} onPress={() => navigation.navigate('Tabs', { screen: 'Poin' })} />
        </View>

        {/* Stamp progress */}
        <View style={styles.section}>
          <StampCard count={stampCount} goal={stampGoal} />
        </View>

        {/* Quick actions */}
        <View style={[styles.section, styles.quickRow]}>
          {QUICK.map((q) => (
            <Pressable key={q.key} style={styles.quick} onPress={() => go(q.to)}>
              <LinearGradient colors={gradients.gold} style={styles.quickIcon}>
                <Ionicons name={q.icon} size={22} color={colors.onGold} />
              </LinearGradient>
              <Text style={styles.quickLabel}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Promo berlangsung (sembunyi kalau belum ada) */}
        {promos.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Promo Berlangsung" actionLabel="Lihat semua" onAction={() => navigation.navigate('Vouchers')} />
          <FlatList
            data={promos}
            keyExtractor={(i) => i.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
            renderItem={({ item }) => <PromoCard item={item} />}
          />
        </View>
        )}

        {/* Event terdekat (sembunyi kalau belum ada) */}
        {events.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Event Terdekat" actionLabel="Lihat semua" onAction={() => navigation.navigate('Tabs', { screen: 'Event' })} />
          {events.slice(0, 2).map((ev) => (
            <Pressable key={ev.id} onPress={() => navigation.navigate('EventDetail', { id: ev.id })}>
              <Card style={styles.eventRow}>
                <View style={styles.eventEmoji}><Text style={{ fontSize: 26 }}>{ev.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Pill label={ev.tag} tone={ev.price === 0 ? 'ok' : 'gold'} />
                  <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.eventMeta}>{ev.dateLabel} · {ev.time}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted2} />
              </Card>
            </Pressable>
          ))}
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberCard({ user, points, onPress }) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={gradients.memberGold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.member}>
        <View style={styles.memberTop}>
          <View>
            <Text style={styles.memberBrand}>LAKSAMANA MUDA</Text>
            <Text style={styles.memberSub}>Member {user.tier}</Text>
          </View>
          <View style={styles.tierBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.onGold} />
            <Text style={styles.tierBadgeText}>{user.tier}</Text>
          </View>
        </View>
        <View style={styles.memberBottom}>
          <View>
            <Text style={styles.memberPointsLabel}>Poin kamu</Text>
            <Text style={styles.memberPoints}>{points.toLocaleString('id-ID')}</Text>
          </View>
          <View style={styles.memberId}>
            <Text style={styles.memberIdText}>{user.memberId}</Text>
            <View style={styles.qrMini}>
              <Ionicons name="qr-code" size={30} color={colors.onGold} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function StampCard({ count, goal }) {
  return (
    <Card style={styles.stampCard}>
      <View style={styles.stampHead}>
        <Text style={styles.stampTitle}>Kumpulkan {goal} gelas, gratis 1</Text>
        <Text style={styles.stampCount}>{count}/{goal}</Text>
      </View>
      <View style={styles.stampRow}>
        {Array.from({ length: goal }).map((_, i) => (
          <View key={i} style={[styles.stamp, i < count && styles.stampOn]}>
            <Ionicons name="cafe" size={14} color={i < count ? colors.onGold : colors.muted2} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function PromoCard({ item }) {
  const tone = item.tone === 'gold' ? gradients.goldDeep : item.tone === 'violet' ? ['#5B4699', '#2C2150'] : ['#2C5A85', '#16304A'];
  return (
    <LinearGradient colors={tone} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
      <View style={styles.promoTag}><Text style={styles.promoTagText}>{item.tag}</Text></View>
      <Text style={styles.promoTitle}>{item.title}</Text>
      <Text style={styles.promoSub}>{item.sub}</Text>
      <View style={styles.promoFoot}>
        <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.8)" />
        <Text style={styles.promoEnd}>{item.end}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  hi: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold, borderWidth: 1.5, borderColor: colors.surface },
  cartBadge: { position: 'absolute', top: 6, right: 6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartBadgeText: { color: colors.onGold, fontSize: 10, fontWeight: '800' },
  section: { paddingHorizontal: 20, marginTop: 18 },

  member: { borderRadius: radius.xl, padding: 20, ...shadow.card },
  memberTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  memberBrand: { color: colors.onGold, fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  memberSub: { color: 'rgba(26,21,9,0.7)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(26,21,9,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tierBadgeText: { color: colors.onGold, fontSize: 12, fontWeight: '800' },
  memberBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28 },
  memberPointsLabel: { color: 'rgba(26,21,9,0.7)', fontSize: 12, fontWeight: '700' },
  memberPoints: { color: colors.onGold, fontSize: 38, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  memberId: { alignItems: 'flex-end', gap: 8 },
  memberIdText: { color: 'rgba(26,21,9,0.75)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  qrMini: { backgroundColor: 'rgba(255,255,255,0.5)', padding: 6, borderRadius: 10 },

  stampCard: { padding: 16 },
  stampHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  stampTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  stampCount: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  stampRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stamp: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  stampOn: { backgroundColor: colors.gold, borderColor: colors.gold, borderStyle: 'solid' },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { alignItems: 'center', gap: 8, width: '23%' },
  quickIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  quickLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  promo: { width: 240, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', minHeight: 130 },
  promoTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  promoTagText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 10, letterSpacing: -0.3 },
  promoSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '500', marginTop: 3 },
  promoFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  promoEnd: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 12 },
  eventEmoji: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 5 },
  eventMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
