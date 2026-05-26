import { supabase } from './supabase';

export type SyncedStaffMember = {
  name: string;
  email?: string;
  role: string;
};

export type SyncSummary = {
  updated: number;      // existing staff whose POS data was refreshed
  invited: number;      // new staff who received invite emails
  alreadyOnMise: number; // existing staff with accounts — no action taken
};

type InviteGateResult =
  | { send: true }
  | { send: false; reason: 'already_on_mise' | 'already_invited' | 'bank_linked' };

/**
 * Determines whether a staff member from a POS sync should receive an invite.
 *
 * Returns send:false if any of the following are true:
 *   - A staff_members row already exists with the same email
 *   - A staff_members row already exists with the same name at this location
 *   - invite_sent_at is already set on the existing row
 *   - bank_linked is true on the existing row
 */
export async function shouldSendInvite(
  locationId: string,
  member: SyncedStaffMember,
): Promise<InviteGateResult> {
  // 1. Check by email (location-agnostic — email is globally unique for a person)
  if (member.email) {
    const { data: byEmail } = await supabase
      .from('staff_members')
      .select('id, invite_sent_at, bank_linked')
      .eq('email', member.email.trim().toLowerCase())
      .maybeSingle();

    if (byEmail) {
      if (byEmail.bank_linked) return { send: false, reason: 'bank_linked' };
      if (byEmail.invite_sent_at) return { send: false, reason: 'already_invited' };
      return { send: false, reason: 'already_on_mise' };
    }
  }

  // 2. Check by name at this location (case-insensitive)
  const { data: byName } = await supabase
    .from('staff_members')
    .select('id, invite_sent_at, bank_linked')
    .eq('location_id', locationId)
    .ilike('name', member.name.trim())
    .maybeSingle();

  if (byName) {
    if (byName.bank_linked) return { send: false, reason: 'bank_linked' };
    if (byName.invite_sent_at) return { send: false, reason: 'already_invited' };
    return { send: false, reason: 'already_on_mise' };
  }

  return { send: true };
}

/**
 * Processes a list of staff synced from a POS system (Squirrel, Push, ADP).
 *
 * For each member:
 *   - Skips invite if already on Mise, already invited, or bank already linked
 *   - Calls the send-staff-invite edge function only for genuinely new staff
 *
 * Returns a SyncSummary so the manager knows exactly what happened.
 */
export async function processSyncedStaff(
  locationId: string,
  syncedStaff: SyncedStaffMember[],
): Promise<SyncSummary> {
  let updated = 0;
  let invited = 0;
  let alreadyOnMise = 0;

  for (const member of syncedStaff) {
    const gate = await shouldSendInvite(locationId, member);

    if (!gate.send) {
      updated++;
      alreadyOnMise++;
      continue;
    }

    // New staff member — send invite via edge function
    try {
      const { error } = await supabase.functions.invoke('send-staff-invite', {
        body: {
          email: member.email,
          name: member.name,
          role: member.role,
          location_id: locationId,
        },
      });
      if (!error) {
        invited++;
      } else {
        console.warn('[syncInviteGate] invite failed for', member.name, error.message);
      }
    } catch (err) {
      // Don't let a single invite failure abort the whole sync
      console.warn('[syncInviteGate] invite error for', member.name, err);
    }
  }

  return { updated, invited, alreadyOnMise };
}

/** Formats a SyncSummary into the manager-facing string shown after sync. */
export function formatSyncSummary(summary: SyncSummary): string {
  const parts: string[] = [];
  if (summary.updated > 0)
    parts.push(`${summary.updated} staff updated`);
  if (summary.invited > 0)
    parts.push(`${summary.invited} new staff invited`);
  if (summary.alreadyOnMise > 0)
    parts.push(`${summary.alreadyOnMise} already on Mise`);
  return parts.length > 0
    ? `Sync complete — ${parts.join(', ')}`
    : 'Sync complete — no changes';
}
