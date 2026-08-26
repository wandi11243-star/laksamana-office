import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import OrderScreen from '../screens/OrderScreen';
import LoyaltyScreen from '../screens/LoyaltyScreen';
import EventScreen from '../screens/EventScreen';
import ProfileScreen from '../screens/ProfileScreen';

import ItemDetailScreen from '../screens/ItemDetailScreen';
import CartScreen from '../screens/CartScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import ReservationScreen from '../screens/ReservationScreen';
import RewardCatalogScreen from '../screens/RewardCatalogScreen';
import VouchersScreen from '../screens/VouchersScreen';
import ConnectionsScreen from '../screens/ConnectionsScreen';
import ServerReservationsScreen from '../screens/ServerReservationsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS = {
  Beranda: ['home', 'home-outline'],
  Menu: ['cafe', 'cafe-outline'],
  Poin: ['star', 'star-outline'],
  Event: ['musical-notes', 'musical-notes-outline'],
  Profil: ['person', 'person-outline'],
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted2,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const [on, off] = ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? on : off} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Beranda" component={HomeScreen} />
      <Tab.Screen name="Menu" component={OrderScreen} />
      <Tab.Screen name="Poin" component={LoyaltyScreen} />
      <Tab.Screen name="Event" component={EventScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoggedIn } = useApp();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      {!isLoggedIn ? (
        // Belum login: satu-satunya layar. Begitu login berhasil authUser terisi,
        // komponen ini render ulang dan berpindah ke stack aplikasi di bawah.
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
          <Stack.Screen name="Cart" component={CartScreen} />
          <Stack.Screen name="EventDetail" component={EventDetailScreen} />
          <Stack.Screen name="Reservation" component={ReservationScreen} />
          <Stack.Screen name="RewardCatalog" component={RewardCatalogScreen} />
          <Stack.Screen name="Vouchers" component={VouchersScreen} />
          <Stack.Screen name="Connections" component={ConnectionsScreen} />
          <Stack.Screen name="ServerReservations" component={ServerReservationsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

// eslint-disable-next-line no-unused-vars
const _styles = StyleSheet.create({});
