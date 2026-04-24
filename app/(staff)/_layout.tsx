import { Tabs } from 'expo-router';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#3d4f47';

export default function StaffLayout() {
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
        name="mytips"
        options={{
          title: 'My Tips',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="dollarsign.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.line.uptrend.xyaxis" color={color} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="bolt.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="rosette" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
