/*
  Tipografi. Memakai system font agar tanpa aset tambahan tetap jalan.
  Untuk produksi, ganti fontFamily display dengan Plus Jakarta Sans dan body
  dengan Inter (sesuai design system office) via expo-font.
*/
import { Platform } from 'react-native';

export const font = {
  display: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'System' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
};

export const type = {
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  h3: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  h4: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  bodySm: { fontSize: 13, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  cap: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  mono: { fontVariant: ['tabular-nums'] },
};

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
};

export default { font, type, radius, shadow };
