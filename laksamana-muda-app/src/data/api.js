/*
  Lapisan pemanggil API. Semua fetch ke server lewat sini supaya satu tempat
  saja yang tahu bentuk balasan {ok, data, error} dari api.php.

  Kalau nanti data mock diganti data server sepenuhnya, tambahkan fungsi baru
  di sini (getMenu, getEvents, dst) dengan pola yang sama.
*/
import { API_BASE } from '../config';

async function panggil(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${API_BASE}/api.php?${qs}`);
  if (!res.ok) throw new Error(`Server balas ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Permintaan gagal');
  return json;
}

// Daftar reservasi dari database Office (baca saja). phone opsional: menyaring
// milik satu nomor.
export async function getReservations(phone) {
  const json = await panggil('reservations', phone ? { phone } : {});
  return json.data || [];
}

// Cek koneksi API + database.
export async function ping() {
  return panggil('ping');
}
