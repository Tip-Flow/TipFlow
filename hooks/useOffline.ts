import { useEffect, useState } from 'react';

export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Dynamic import keeps NetInfo (which accesses window.navigator) out of
    // the Node.js SSR bundle — static imports would crash expo-router's render.js.
    if (typeof window === 'undefined') return;

    let unsubscribe: (() => void) | undefined;

    import('@react-native-community/netinfo').then(({ default: NetInfo }) => {
      unsubscribe = NetInfo.addEventListener((state) => {
        const connected = state.isConnected === true && state.isInternetReachable !== false;
        setIsOffline(!connected);
      });
    }).catch(() => {});

    return () => unsubscribe?.();
  }, []);

  return isOffline;
}
