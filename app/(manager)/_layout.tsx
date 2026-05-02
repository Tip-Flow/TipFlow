import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { DesktopSidebar } from '@/components/desktop-sidebar';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useIsDesktop } from '@/hooks/use-is-desktop';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#3d4f47';

export default function ManagerLayout() {
  const isDesktop = useIsDesktop();

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: BG }}>
      {isDesktop && <DesktopSidebar />}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarButton: HapticTab,
            tabBarActiveTintColor: BLUE,
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
              : { fontSize: 11, fontWeight: '600' },
          }}>
          <Tabs.Screen
            name="home"
            options={{
              title: 'Home',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="pos"
            options={{
              title: 'POS',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="creditcard.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="calculate"
            options={{
              title: 'Calculate',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="plusminus" color={color} />,
            }}
          />
          <Tabs.Screen
            name="payouts"
            options={{
              title: 'Payouts',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="banknote.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="rewards"
            options={{
              title: 'Rewards',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="star.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="staff"
            options={{
              title: 'Staff',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.2.fill" color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => <IconSymbol size={26} name="gearshape.fill" color={color} />,
            }}
          />
          <Tabs.Screen name="housepool" options={{ href: null }} />
          <Tabs.Screen name="shiftgoals" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}
