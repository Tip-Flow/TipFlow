import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export type UseLocationIdResult = {
  locationId: string | null;
  locationName: string;
  locationLoading: boolean;
  refetchLocation: () => Promise<void>;
};

/**
 * Resolves the current manager's location deterministically.
 *
 * Web timing problem this solves:
 *   Supabase restores the auth session from localStorage asynchronously on
 *   page load. If the first location query fires before the session is ready,
 *   RLS blocks it (returns PGRST116 — 0 rows) and locationId stays null.
 *   We listen to onAuthStateChange so the query retries the moment the
 *   INITIAL_SESSION / SIGNED_IN event fires, guaranteeing the session is
 *   established before the query runs.
 */
export function useLocationId(): UseLocationIdResult {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationLoading, setLocationLoading] = useState(true);

  const refetchLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      // Ensure the auth session is ready — critical on web where session
      // restoration from localStorage is async.
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      console.log(
        '[useLocationId] session:', session?.user?.email ?? 'none (unauthenticated)',
        '| sessionErr:', sessionErr?.message ?? null,
      );

      if (!session) {
        console.log('[useLocationId] no session — location query deferred until auth resolves');
        return;
      }

      // Step 1: resolve the manager's directly-linked location_id.
      // This is more reliable than ORDER BY created_at LIMIT 1, which breaks
      // in multi-location setups and when locations.organisation_id is null
      // (causing the org-based RLS policy to return 0 rows).
      const { data: mgr, error: mgrErr } = await supabase
        .from('managers')
        .select('location_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      console.log('[useLocationId] manager row — location_id:', mgr?.location_id ?? null, '| mgrErr:', mgrErr?.message ?? null);

      let locationQuery;
      if (mgr?.location_id) {
        // Manager has a directly-linked location — use it.
        locationQuery = supabase
          .from('locations')
          .select('id, name')
          .eq('id', mgr.location_id)
          .single();
      } else {
        // Fallback for admins or users not in the managers table.
        console.log('[useLocationId] no manager row — falling back to first location');
        locationQuery = supabase
          .from('locations')
          .select('id, name')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();
      }

      const { data, error } = await locationQuery;

      console.log('[useLocationId] query result — data:', data, '| error:', error?.message ?? null, '| code:', error?.code ?? null);

      if (error) {
        console.log('[useLocationId] query failed:', error.message, error.code);
        return;
      }
      if (data) {
        console.log('[useLocationId] resolved ✓', data.id, data.name);
        setLocationId(data.id);
        setLocationName(data.name);
      } else {
        console.log('[useLocationId] query returned no rows — check locations table and RLS policies');
      }
    } catch (err: unknown) {
      console.log('[useLocationId] exception:', err instanceof Error ? err.message : String(err));
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    // Attempt immediately — may be a no-op if session isn't ready yet on web
    refetchLocation();

    // Re-run whenever auth state changes. On web this catches INITIAL_SESSION
    // (fired when Supabase finishes reading localStorage) and SIGNED_IN.
    // On mobile AsyncStorage is also async so this helps there too.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log('[useLocationId] auth event:', event);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        refetchLocation();
      }
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', refetchLocation);
      return () => {
        subscription.unsubscribe();
        window.removeEventListener('focus', refetchLocation);
      };
    }

    return () => subscription.unsubscribe();
  }, [refetchLocation]);

  return { locationId, locationName, locationLoading, refetchLocation };
}
