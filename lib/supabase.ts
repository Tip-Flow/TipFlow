import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// EXPO_PUBLIC_* vars are baked in at bundle time by Metro. If they are missing
// here at runtime it means they were not set in Vercel → Environment Variables
// before the build ran. The app will be non-functional until a redeploy.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Mise] Supabase is not configured.\n' +
    'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to\n' +
    'Vercel → Project Settings → Environment Variables, then redeploy.'
  );
}

// AsyncStorage reads localStorage which doesn't exist in Node.js SSR.
// Pass it only in browser/native environments.
const isClient = typeof window !== 'undefined';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: isClient ? AsyncStorage : undefined,
      autoRefreshToken: isClient,
      persistSession: isClient,
      detectSessionInUrl: false,
    },
  }
);
