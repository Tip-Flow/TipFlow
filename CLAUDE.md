# TipFlow — Claude Code Project Memory

Canadian restaurant tip management SaaS.
POS → tip calculation → AptPay → staff bank accounts. Instant. No cash. No spreadsheets.

---

## Stack

- **Frontend:** React Native + Expo (TypeScript)
- **Backend:** Supabase (region: `ca-central-1` — never change this)
- **Payments:** AptPay (Interac e-Transfer for staff payouts, EFT for restaurant deposits)
- **Bank linking:** Flinks open banking (staff link their own accounts — TipFlow never sees credentials)
- **POS integrations:** Square REST API (OAuth), Lightspeed (partner program), CSV parser (any POS)
- **OTA updates:** Expo EAS Update — fixes deploy without App Store review

## Commands

```bash
npx expo start          # Start dev server
npx expo run:ios        # Run on iOS simulator
npx expo run:android    # Run on Android emulator
eas build               # Production build
eas update              # Push OTA update to all users
npx supabase start      # Local Supabase instance
npx supabase db push    # Apply migrations
```

## Project Structure

```
tipflow/
├── app/                    # Expo Router screens
│   ├── (auth)/             # Login, onboarding
│   ├── (manager)/          # Manager tab screens
│   └── (staff)/            # Staff tab screens
├── components/             # Shared UI components
├── lib/
│   ├── supabase.ts         # Supabase client (ca-central-1)
│   ├── aptpay.ts           # AptPay payout logic
│   └── flinks.ts           # Bank linking flows
├── hooks/                  # Custom React hooks
├── types/                  # TypeScript types
└── supabase/
    └── migrations/         # All DB migrations (never edit directly)
```

---

## Database Rules

- **Always use Row Level Security (RLS).** Every table must have RLS enabled.
- Staff can only read their own rows. Never expose other staff earnings.
- The RLS policy pattern for staff tables:
  ```sql
  USING (staff_id = auth.uid())
  ```
- Managers can read all rows for their own location(s) only.
- Never disable RLS to fix a bug — fix the policy instead.
- All migrations go in `supabase/migrations/` with timestamp prefix.

## Core Data Models

```typescript
// Locations (restaurants)
type Location = {
  id: string
  name: string
  city: string
  pos_type: 'square' | 'lightspeed' | 'csv' | 'manual'
  cra_tip_type: 'direct' | 'controlled'  // CRA classification
  aptpay_merchant_id: string
}

// Staff
type StaffMember = {
  id: string
  location_id: string
  name: string
  role: 'server' | 'bartender' | 'runner' | 'host' | 'kitchen'
  email: string
  flinks_token: string | null        // null = bank not linked yet
  payout_method: 'etransfer' | 'eft' | 'cash'
  bank_linked: boolean
}

// Shifts
type Shift = {
  id: string
  location_id: string
  date: string
  name: string                       // e.g. "Friday Dinner"
  total_tips: number                 // CAD cents
  total_sales: number
  status: 'pending' | 'calculated' | 'paid'
  pos_source: 'square_api' | 'csv' | 'manual'
}

// Tip allocations (one per staff per shift)
type TipAllocation = {
  id: string
  shift_id: string
  staff_id: string
  hours_worked: number
  role_weight: number                // % weight for this role
  calculated_amount: number          // CAD cents
  aptpay_ref: string | null          // set after payout
  paid_at: string | null
  cash_confirmed: boolean            // for cash payouts
}
```

---

## Tip Calculation Algorithm

```typescript
// Weight per staff member
const weight = (role_pct / 100) * hours_worked

// Share of total pool
const share = (weight / total_weight) * total_tips
```

Role percentages are configurable per location. Default:
- Server: 70%, Bartender: 60%, Runner: 30%, Host: 20%

---

## Payment Rules

- **Never hold funds.** All money flows through AptPay's licensed infrastructure only.
- AptPay sandbox credentials go in `.env.local` (never committed).
- Payout flow: calculate → manager confirms → AptPay API call → store `aptpay_ref` → mark paid.
- Cash payouts: manager confirms in app → creates CRA audit record with timestamp + manager ID.
- All payout amounts are in **CAD cents** internally. Display as dollars in UI.
- Interac e-Transfer: uses staff email address. Staff must have auto-deposit enabled.

## Bank Linking (Flinks)

- Staff receive SMS/email invite → click link → Flinks iframe opens → staff log into their bank.
- TipFlow stores only the Flinks token, never raw account numbers or credentials.
- If `flinks_token` is null, fall back to cash payout and flag staff as "bank not linked".

---

## Two User Roles

### Manager (operator)
Sees: all staff, all shifts, all payouts for their location(s).
Can: import POS data, trigger payouts, send bonuses, manage staff, configure tip pool rules.

### Staff (employee)
Sees: **only their own** earnings, payout history, challenges, badges, leaderboard rank.
Cannot: see other staff dollar amounts (only tip % on leaderboard).
Cannot: access manager screens.

---

## Gamification System

Bonuses come from a **separate restaurant-funded bonus pool** — never redistributed from the tip pool.

| Feature | Logic |
|---|---|
| Leaderboard | Ranked by tip % per shift, not raw amount. Resets weekly (Sunday). |
| Challenges | Upsell Master ($25), 20% Club ($30), Sommelier ($20), Full Week ($20). Auto-paid via AptPay on completion. |
| Team Goal | Weekly location target. Everyone earns $20 CAD bonus on hit. |
| Streaks | 5+ shifts above 20% = streak bonus. Tracked per staff. |
| Badges | First Payout, 10 Shifts, Top Earner, 5-Day Streak, Diamond Earner, Legend. |

---

## CRA Compliance

Every location has a `cra_tip_type`:
- **Direct Tips:** no CPP/EI deductions. Staff self-report on T1. Manager pays out gross.
- **Controlled Tips:** employer deducts CPP/EI. Manager handles T4 reporting.

Always surface CRA classification in payout confirmations and staff portal.

---

## Security Rules

- RLS enforced at DB layer — never rely on app logic alone for data isolation.
- Biometric auth (Face ID / Touch ID) required before any payout action.
- API keys in environment variables only. Never hardcode.
- AES-256 at rest (Supabase default on `ca-central-1`). TLS 1.3 in transit.
- Flinks tokens stored in encrypted vault column, not plain text.
- Session timeout: 30 min inactivity for managers, 15 min for staff.

---

## Canadian Compliance (Non-Negotiable)

- **Data residency:** Supabase region is `ca-central-1` (AWS Canada). Never change.
- **PIPEDA:** Explicit consent on first launch. Right to erasure in profile settings.
- **RPAA:** TipFlow is registered with Bank of Canada under Retail Payment Activities Act. Surface this trust signal in onboarding and settings.
- **Quebec Law 25:** French language support required for Quebec locations.

---

## Environment Variables

```bash
# .env.local (never commit)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
APTPAY_API_KEY=
APTPAY_MERCHANT_ID=
FLINKS_CLIENT_ID=
SQUARE_APP_ID=
SQUARE_ACCESS_TOKEN=
```

---

## Code Conventions

- TypeScript strict mode. No `any`.
- All monetary values in CAD cents as integers. Convert to dollars only for display.
- Async/await over `.then()` chains.
- Component files: PascalCase (`ShiftCard.tsx`). Hooks: camelCase prefixed `use` (`useShiftData.ts`).
- Supabase queries go in `lib/` or custom hooks — never inline in components.
- Error boundaries around all payment-related screens.

## What NOT to Do

- Never store raw bank account numbers or credentials.
- Never mix bonus pool funds with tip pool funds.
- Never disable RLS to fix a bug.
- Never change the Supabase region from `ca-central-1`.
- Never make payout API calls without manager confirmation step.
- Never show one staff member's dollar amount to another staff member.
