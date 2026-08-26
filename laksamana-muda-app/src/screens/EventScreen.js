import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../theme/colors';
import { radius } from '../theme/typography';
import { Pill } from '../components/ui';
import { events, rupiah } from '../data/mockData';

export default function EventScreen({ navigation }) {
  const { tickets } = useApp();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Event & Live Music</Text>
        {tickets.length > 0 && (
          <View style={styles.myTix}>
            <Ionicons name="ticket" size={14} color={colors.gold} />
            <Text style={styles.myTixText}>{tickets.length} tiket</Text>
          </View>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Featured (hanya kalau ada event) */}
        {events.length > 0 && (
        <Pressable style={styles.section} onPress={() => navigation.navigate('EventDetail', { id: events[0].id })}>
          <LinearGradient colors={['#3A2E5E', '#1A1330']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featured}>
            <View style={styles.featuredTop}>
              <Pill label="FEATURED" tone="violet" />
              <Text style={{ fontSize: 40 }}>{events[0].emoji}</Text>
            </View>
            <Text style={styles.featuredTitle}>{events[0].title}</Text>
            <Text style={styles.featuredMeta}>{events[0].dateLabel} · {events[0].time}</Text>
            <View style={styles.featuredFoot}>
              <View style={styles.seatsLeft}>
                <Ionicons name="flame" size={13} color={colors.gold} />
                <Text style={styles.seatsLeftText}>Sisa {events[0].left} tiket</Text>
              </View>
              <View style={styles.buyMini}>
                <Text style={styles.buyMiniText}>Beli Tiket</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.onGold} />
              </View>
            </View>
          </LinearGradient>
        </Pressable>
        )}

        {/* Upcoming list */}
        <View style={[styles.section, { marginTop: 22 }]}>
          <Text style={styles.secTitle}>Upcoming</Text>
          {events.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.muted2} />
              <Text style={styles.emptyText}>Belum ada event</Text>
              <Text style={styles.emptyHint}>Event akan tampil di sini setelah tersambung ke data server.</Text>
            </View>
          )}
          {events.map((ev) => {
            const soldPct = Math.round(((ev.seats - ev.left) / ev.seats) * 100);
            return (
              <Pressable key={ev.id} style={styles.card} onPress={() => navigation.navigate('EventDetail', { id: ev.id })}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateDay}>{ev.dateLabel.split(' ')[1]}</Text>
                  <Text style={styles.dateMon}>{ev.dateLabel.split(' ')[2]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Pill label={ev.tag} tone={ev.price === 0 ? 'ok' : 'gold'} style={{ marginBottom: 5 }} />
                  <Text style={styles.cardTitle} numberOfLines={1}>{ev.title}</Text>
                  <View style={styles.cardMetaRow}>
                    <Ionicons name="time-outline" size={12} color={colors.muted} />
                    <Text style={styles.cardMeta}>{ev.time}</Text>
                    <Ionicons name="location-outline" size={12} color={colors.muted} style={{ marginLeft: 8 }} />
                    <Text style={styles.cardMeta} numberOfLines={1}>{ev.location}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${soldPct}%` }]} />
                  </View>
                  <View style={styles.cardFoot}>
                    <Text style={styles.priceText}>{ev.price === 0 ? 'Gratis · RSVP' : rupiah(ev.price)}</Text>
                    <Text style={styles.leftText}>Sisa {ev.left}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  myTix: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldSoftBorder, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  myTixText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  section: { paddingHorizontal: 20, marginTop: 14 },
  featured: { borderRadius: radius.xl, padding: 20, minHeight: 190, justifyContent: 'space-between' },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  featuredTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 14, letterSpacing: -0.5 },
  featuredMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6 },
  featuredFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  seatsLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  seatsLeftText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  buyMini: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  buyMiniText: { color: colors.onGold, fontSize: 13, fontWeight: '800' },

  secTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  card: { flexDirection: 'row', gap: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  dateBox: { width: 54, height: 60, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  dateDay: { color: colors.gold, fontSize: 22, fontWeight: '900' },
  dateMon: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '500' },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surface2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  priceText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  leftText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptyHint: { color: colors.muted, fontSize: 12.5, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },
});
