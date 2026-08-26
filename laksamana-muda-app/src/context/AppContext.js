/*
  State global aplikasi: sesi login, poin, keranjang, voucher, koneksi,
  reservasi, tiket. Prototype memakai useState + Context. Di produksi ganti
  dengan store (Zustand/Redux) + sinkron API/backend.

  LOGIN: versi simple tanpa backend. accounts dicocokkan di memori (lihat
  mockData). authUser null = belum login -> RootNavigator menampilkan
  LoginScreen. Di produksi, login diganti panggilan API yang membalas token,
  dan sesi disimpan aman (mis. expo-secure-store), bukan di state biasa.
*/
import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  accounts,
  vouchers as seedVouchers,
  connections as seedConnections,
} from '../data/mockData';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(null); // akun yang sedang login
  const [points, setPoints] = useState(0);
  const [stampCount, setStampCount] = useState(0);
  const [cart, setCart] = useState([]); // {item, qty, size}
  const [vouchers, setVouchers] = useState(seedVouchers);
  const [connections, setConnections] = useState(seedConnections);
  const [reservations, setReservations] = useState([]);
  const [tickets, setTickets] = useState([]);

  // Cocokkan email + password (email tidak peka huruf besar/kecil). Kembalikan
  // {ok} supaya LoginScreen bisa menampilkan pesan galat sendiri.
  const login = (email, password) => {
    const e = String(email || '').trim().toLowerCase();
    const acc = accounts.find((a) => a.email.toLowerCase() === e && a.password === password);
    if (!acc) return { ok: false, error: 'Email atau password salah.' };
    setAuthUser(acc);
    setPoints(acc.points);
    setStampCount(acc.stampCount);
    return { ok: true };
  };

  const logout = () => {
    setAuthUser(null);
    setCart([]);
    setReservations([]);
    setTickets([]);
  };

  const addToCart = (item, qty = 1, size = 'Reguler') => {
    setCart((prev) => {
      const key = item.id + size;
      const found = prev.find((c) => c.key === key);
      if (found) {
        return prev.map((c) => (c.key === key ? { ...c, qty: c.qty + qty } : c));
      }
      return [...prev, { key, item, qty, size }];
    });
  };

  const updateQty = (key, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.key === key ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0);
  const cartPoints = cart.reduce((s, c) => s + (c.item.points || 0) * c.qty, 0);

  const checkout = () => {
    setPoints((p) => p + cartPoints);
    setStampCount((s) => (s + cartCount) % 10);
    clearCart();
  };

  const redeemReward = (reward) => {
    if (points < reward.cost) return false;
    setPoints((p) => p - reward.cost);
    return true;
  };

  const toggleConnection = (id) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, connected: !c.connected } : c))
    );
  };

  const useVoucher = (id) => {
    setVouchers((prev) => prev.map((v) => (v.id === id ? { ...v, used: true } : v)));
  };

  const addReservation = (r) => setReservations((prev) => [{ ...r, id: 'RSV' + Date.now() }, ...prev]);
  const addTicket = (t) => setTickets((prev) => [{ ...t, id: 'TKT' + Date.now() }, ...prev]);

  const value = useMemo(
    () => ({
      authUser,
      user: authUser || {},
      isLoggedIn: !!authUser,
      login,
      logout,
      points,
      stampCount,
      stampGoal: (authUser && authUser.stampGoal) || 10,
      cart,
      cartCount,
      cartTotal,
      cartPoints,
      vouchers,
      connections,
      reservations,
      tickets,
      addToCart,
      updateQty,
      clearCart,
      checkout,
      redeemReward,
      toggleConnection,
      useVoucher,
      addReservation,
      addTicket,
    }),
    [authUser, points, stampCount, cart, vouchers, connections, reservations, tickets]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
};
