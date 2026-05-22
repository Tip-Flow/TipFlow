import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

// Sentry must not run during SSR — expo-router static export executes in Node.js
// where @sentry/react-native accesses browser/native globals that don't exist.
if (typeof window !== 'undefined') {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
    release: process.env.EXPO_PUBLIC_APP_VERSION,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.2,
    enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  });
}

function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        Sentry.setUser({
          id: session.user.id,
          email: session.user.email,
        });
        const role = session.user.user_metadata?.role as string | undefined;
        if (role) Sentry.setTag('user_role', role);
      } else {
        Sentry.setUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
            <Stack.Screen name="(manager)" options={{ headerShown: false }} />
            <Stack.Screen name="(staff)" options={{ headerShown: false }} />
            <Stack.Screen name="(regional)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </View>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Sentry.wrap only works in browser context; during SSR export use the plain component.
export default typeof window !== 'undefined' ? Sentry.wrap(RootLayout) : RootLayout;
