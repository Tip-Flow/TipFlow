import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Calls `callback` when the browser window regains focus (web only).
 * On mobile, useFocusEffect already handles screen-focus refreshes;
 * this is the web equivalent for tab-switching and browser-focus events.
 */
export function useWebFocus(callback: () => void): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.addEventListener('focus', callback);
    return () => window.removeEventListener('focus', callback);
  }, [callback]);
}
