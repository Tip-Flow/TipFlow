import * as Sentry from '@sentry/react-native';

function breadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
) {
  Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}

export const track = {
  login: (email: string, role: string) =>
    breadcrumb('User logged in', 'auth', { email, role }),

  logout: () =>
    breadcrumb('User logged out', 'auth'),

  calculateTips: (shiftId: string, locationId: string, staffCount: number) =>
    breadcrumb('Tips calculated', 'tips', { shiftId, locationId, staffCount }),

  payEFT: (shiftId: string, totalCents: number, staffCount: number) =>
    breadcrumb('EFT payout triggered', 'payments', { shiftId, totalCents, staffCount }),

  inviteStaff: (email: string, role: string, locationId?: string) =>
    breadcrumb('Staff invite sent', 'staff', { email, role, locationId }),

  offlinePayoutBlocked: (shiftId: string) =>
    breadcrumb('EFT blocked — offline', 'payments', { shiftId }),
};
