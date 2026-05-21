import { Tabs } from 'expo-router';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#3d4f47';

const MyTipsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="dollarsign.circle.fill" color={color} />;
const ProgressIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="chart.line.uptrend.xyaxis" color={color} />;
const GoalsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="bolt.fill" color={color} />;
const BadgesIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="rosette" color={color} />;
const ProfileIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="person.fill" color={color} />;

export default function StaffLayout() {
  return (
    <ErrorBoundary>
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
        <Tabs.Screen name="mytips" options={{ title: 'My Tips', tabBarIcon: MyTipsIcon }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ProgressIcon }} />
        <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: GoalsIcon }} />
        <Tabs.Screen name="badges" options={{ title: 'Badges', tabBarIcon: BadgesIcon }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ProfileIcon }} />
      </Tabs>
    </ErrorBoundary>
  );
}
