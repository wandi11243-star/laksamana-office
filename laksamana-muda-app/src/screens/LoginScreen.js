/*
  Layar login (email + password). Versi simple: mencocokkan akun di memori lewat
  useApp().login. Kotak "akun demo" sengaja ditampilkan supaya penguji tahu
  kredensialnya; di produksi kotak ini DIHAPUS dan login lewat API + token.
*/
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import { radius } from '../theme/typography';
import { GoldButton, Wordmark } from '../components/ui';
import { accounts } from '../data/mockData';

export default function LoginScreen() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    if (!email.trim() || !password) {
      setError('Isi email dan password dulu.');
      return;
    }
    const res = login(email, password);
    if (!res.ok) setError(res.error);
    // Kalau ok, RootNavigator otomatis pindah ke aplikasi (authUser terisi).
  };

  // Isi form dari kartu akun demo, sekali tap.
  const pakaiAkun = (a) => {
    setEmail(a.email);
    setPassword(a.password);
    setError('');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandWrap}>
            <View style={styles.logo}>
              <Ionicons name="boat" size={34} color={colors.onGold} />
            </View>
            <Wordmark size={22} />
          </View>

          <Text style={styles.title}>Masuk</Text>
          <Text style={styles.sub}>Masuk untuk poin, reservasi, dan tiket event.</Text>

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <View style={styles.field}>
            <Ionicons name="mail-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              placeholder="nama@email.com"
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.field}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(''); }}
              placeholder="Password"
              placeholderTextColor={colors.muted2}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPass((s) => !s)} hitSlop={8}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <GoldButton label="Masuk" icon="arrow-forward" onPress={submit} style={{ marginTop: 20 }} />

          {/* Kotak akun demo (dihapus di produksi) */}
          <View style={styles.demoBox}>
            <View style={styles.demoHead}>
              <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
              <Text style={styles.demoTitle}>Akun demo (tap untuk isi)</Text>
            </View>
            {accounts.map((a) => (
              <Pressable key={a.email} style={styles.demoRow} onPress={() => pakaiAkun(a)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.demoEmail}>{a.email}</Text>
                  <Text style={styles.demoMeta}>{a.role} · {a.password}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 30, paddingBottom: 40 },
  brandWrap: { alignItems: 'center', gap: 14, marginBottom: 34 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 22, lineHeight: 20 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line,
    borderRadius: radius.md, paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600', height: '100%' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: colors.dangerBg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  demoBox: { marginTop: 30, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14 },
  demoHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  demoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  demoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: colors.lineSoft,
  },
  demoEmail: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  demoMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
