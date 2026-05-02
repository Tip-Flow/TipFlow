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
 * Uses .order('created_at', { ascending: true }) so mobile and web always
 * pick the same row regardless of DB insertion order.
 * On web, re-resolves whenever the browser tab regains focus so sessions
 * restored from localStorage are picked up automatically.
 */
export function useLocationId(): UseLocationIdResult {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationLoading, setLocationLoading] = useState(true);

  const refetchLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error) {
        console.log('[useLocationId] error:', error.message);
        return;
      }
      if (data) {
        console.log('[useLocationId] resolved:', data.id, data.name);
        setLocationId(data.id);
        setLocationName(data.name);
      }
    } catch (err: unknown) {
      console.log('[useLocationId] exception:', err instanceof Error ? err.message : String(err));
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchLocation();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', refetchLocation);
      return () => window.removeEventListener('focus', refetchLocation);
    }
  }, [refetchLocation]);

  return { locationId, locationName, locationLoading, refetchLocation };
}
