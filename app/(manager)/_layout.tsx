import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { DesktopSidebar } from '@/components/desktop-sidebar';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#AAAAAA';

const HomeIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="house.fill" color={color} />;
const PosIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="creditcard.fill" color={color} />;
const CalcIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="plusminus" color={color} />;
const PayoutsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="banknote.fill" color={color} />;
const RewardsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="star.fill" color={color} />;
const StaffIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="person.2.fill" color={color} />;
const SettingsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="gearshape.fill" color={color} />;

export default function ManagerLayout() {
  const isDesktop = useIsDesktop();

  return (
    <ErrorBoundary>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: BG }}>
        {isDesktop && <DesktopSidebar />}
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarButton: HapticTab,
              tabBarActiveTintColor: '#FFFFFF',
              tabBarInactiveTintColor: INACTIVE,
              tabBarStyle: isDesktop
                ? { display: 'none' }
                : {
                    backgroundColor: BG,
                    borderTopColor: '#1a2620',
                    borderTopWidth: 1,
                  },
              tabBarLabelStyle: isDesktop
                ? undefined
                : { fontSize: 12, fontWeight: '600' },
            }}>
            <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: HomeIcon }} />
            <Tabs.Screen name="pos" options={{ title: 'POS', tabBarIcon: PosIcon }} />
            <Tabs.Screen name="calculate" options={{ title: 'Calculate', tabBarIcon: CalcIcon }} />
            <Tabs.Screen name="payouts" options={{ title: 'Payouts', tabBarIcon: PayoutsIcon }} />
            <Tabs.Screen name="rewards" options={{ title: 'Rewards', tabBarIcon: RewardsIcon }} />
            <Tabs.Screen name="staff" options={{ title: 'Staff', tabBarIcon: StaffIcon }} />
            <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon }} />
            <Tabs.Screen name="housepool" options={{ href: null }} />
            <Tabs.Screen name="shiftgoals" options={{ href: null }} />
          </Tabs>
        </View>
      </View>
    </ErrorBoundary>
  );
}
