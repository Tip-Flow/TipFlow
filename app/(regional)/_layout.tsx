import { Tabs } from 'expo-router';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

const BG = '#09100e';
const BLUE = '#4169E1';
const INACTIVE = '#AAAAAA';

const OverviewIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="house.fill" color={color} />;
const LocationsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="mappin.and.ellipse" color={color} />;
const TeamIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="person.2.fill" color={color} />;
const SettingsIcon = ({ color }: { color: string }) => <IconSymbol size={26} name="gearshape.fill" color={color} />;

export default function RegionalLayout() {
  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: '#1a2620',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}>
        <Tabs.Screen name="overview" options={{ title: 'Overview', tabBarIcon: OverviewIcon }} />
        <Tabs.Screen name="locations" options={{ title: 'Locations', tabBarIcon: LocationsIcon }} />
        <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: TeamIcon }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon }} />
        <Tabs.Screen name="location-detail" options={{ href: null }} />
      </Tabs>
    </ErrorBoundary>
  );
}
