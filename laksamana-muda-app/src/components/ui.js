/*
  Komponen UI dasar Laksamana Muda. Dipakai ulang di semua layar supaya
  konsisten dengan design system.
*/
import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients } from '../theme/colors';
import { type, radius, shadow } from '../theme/typography';

// Latar layar standar
export function Screen({ children, style, scroll = false, contentStyle }) {
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top']}>
      <Inner
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? [{ paddingBottom: 120 }, contentStyle] : contentStyle}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

export function Card({ children, style, gradient, onPress }) {
  const content = gradient ? (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, style]}>
      {children}
    </LinearGradient>
  ) : (
    <View style={[styles.card, styles.cardSolid, style]}>{children}</View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function GoldButton({ label, onPress, icon, style, disabled, small }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={({ pressed }) => [{ opacity: pressed || disabled ? 0.7 : 1 }, style]}>
      <LinearGradient
        colors={disabled ? [colors.surface3, colors.surface2] : gradients.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.goldBtn, small && styles.goldBtnSm]}
      >
        {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={disabled ? colors.muted2 : colors.onGold} /> : null}
        <Text style={[styles.goldBtnText, small && { fontSize: 14 }, disabled && { color: colors.muted2 }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon, style, small }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghostBtn, small && styles.ghostBtnSm, { opacity: pressed ? 0.7 : 1 }, style]}>
      {icon ? <Ionicons name={icon} size={small ? 15 : 17} color={colors.gold} /> : null}
      <Text style={[styles.ghostBtnText, small && { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = 'gold', style }) {
  const map = {
    gold: { bg: colors.goldSoft, bd: colors.goldSoftBorder, fg: colors.goldBright },
    ok: { bg: colors.okBg, bd: 'transparent', fg: colors.ok },
    info: { bg: colors.infoBg, bd: 'transparent', fg: colors.info },
    violet: { bg: colors.violetBg, bd: 'transparent', fg: colors.violet },
    danger: { bg: colors.dangerBg, bd: 'transparent', fg: colors.danger },
    muted: { bg: colors.surface2, bd: colors.lineSoft, fg: colors.muted },
  };
  const c = map[tone] || map.gold;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.bd }, style]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

export function IconChip({ name, color = colors.gold, bg = colors.goldSoft, size = 20 }) {
  return (
    <View style={[styles.iconChip, { backgroundColor: bg }]}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

// Wordmark teks (pengganti aset logo saat prototype)
export function Wordmark({ size = 20, sub = true }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={{ color: colors.gold, fontSize: size, fontWeight: '900', letterSpacing: 2 }}>
        LAKSAMANA MUDA
      </Text>
      {sub ? (
        <Text style={{ color: colors.muted, fontSize: size * 0.42, letterSpacing: 3, marginTop: 2 }}>
          COFFEE & LIVE SPACE
        </Text>
      ) : null}
    </View>
  );
}

export { colors, gradients, type, radius, shadow };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { borderRadius: radius.lg, padding: 16, overflow: 'hidden' },
  cardSolid: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.soft },
  goldBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, paddingHorizontal: 20, borderRadius: radius.md,
  },
  goldBtnSm: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.sm },
  goldBtnText: { color: colors.onGold, fontWeight: '800', fontSize: 16 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.goldSoftBorder, backgroundColor: colors.goldSoft,
  },
  ghostBtnSm: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.sm },
  ghostBtnText: { color: colors.gold, fontWeight: '700', fontSize: 15 },
  pill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1,
  },
  pillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sectionAction: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.lineSoft, marginVertical: 14 },
  iconChip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
