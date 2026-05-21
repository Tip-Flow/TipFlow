import { Stack } from 'expo-router';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';

export default function AdminLayout() {
  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorBoundary>
  );
}
