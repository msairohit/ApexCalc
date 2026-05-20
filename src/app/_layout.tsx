import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { VaultProvider } from '../services/vaultState';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <VaultProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="vault/[spaceId]" />
          <Stack.Screen name="vault/settings" />
        </Stack>
      </VaultProvider>
    </SafeAreaProvider>
  );
}
