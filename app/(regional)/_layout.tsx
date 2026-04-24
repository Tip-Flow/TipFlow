import { Tabs } from 'expo-router';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#3d4f47';

export default function RegionalLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: BLUE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: '#1a2620',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="overview"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: 'Locations',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="mappin.and.ellipse" color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
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
    </Tabs>
  );
}
