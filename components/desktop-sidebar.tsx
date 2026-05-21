import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

const BLUE = '#4169E1';
const WHITE = '#ffffff';
const WHITE_MUTED = 'rgba(255,255,255,0.65)';
const WHITE_ACTIVE_BG = 'rgba(255,255,255,0.15)';
const WHITE_HOVER_BG = 'rgba(255,255,255,0.07)';

const NAV_ITEMS = [
  { label: 'Home', segment: 'home', icon: '⊞' },
  { label: 'POS', segment: 'pos', icon: '💳' },
  { label: 'Calculate', segment: 'calculate', icon: '±' },
  { label: 'Payouts', segment: 'payouts', icon: '💸' },
  { label: 'Rewards', segment: 'rewards', icon: '⭐' },
  { label: 'Staff', segment: 'staff', icon: '👥' },
  { label: 'Settings', segment: 'settings', icon: '⚙️' },
] as const;

export const DesktopSidebar = memo(function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.logo}>Mise</Text>
        <Text style={styles.tagline}>Everything in Its Place.</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.includes(item.segment);
          return (
            <TouchableOpacity
              key={item.segment}
              style={[styles.navItem, isActive ? styles.navItemActive : styles.navItemIdle]}
              onPress={() => router.push(`/(manager)/${item.segment}` as any)}
              activeOpacity={0.75}>
              <Text style={styles.navIcon}>{item.icon}</Text>
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>RPAA registered · PIPEDA compliant</Text>
        <Text style={styles.footerText}>Data: ca-central-1</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sidebar: {
    width: 228,
    backgroundColor: BLUE,
    paddingTop: 32,
    paddingHorizontal: 14,
    paddingBottom: 24,
    flexShrink: 0,
  },
  brand: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 11,
    color: WHITE_MUTED,
    marginTop: 2,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  nav: {
    flex: 1,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  navItemIdle: {
    backgroundColor: WHITE_HOVER_BG,
  },
  navItemActive: {
    backgroundColor: WHITE_ACTIVE_BG,
  },
  navIcon: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE_MUTED,
  },
  navLabelActive: {
    color: WHITE,
  },
  footer: {
    paddingHorizontal: 4,
    gap: 3,
    marginTop: 16,
  },
  footerText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
});
