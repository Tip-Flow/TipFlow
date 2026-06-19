-- The existing SELECT policy only grants access when locations.organisation_id
-- matches the manager's organisation_id. This breaks for managers whose linked
-- location has organisation_id = null (e.g. Canteen Ossington / Jamie).
-- Replace it with a policy that also grants access via the direct location_id
-- column on the managers table.

DROP POLICY IF EXISTS "Users can read own org locations" ON locations;

CREATE POLICY "Managers can read own org or directly linked locations"
  ON locations FOR SELECT TO authenticated
  USING (
    -- Location belongs to manager's organisation
    (
      organisation_id IS NOT NULL
      AND organisation_id IN (
        SELECT managers.organisation_id
        FROM managers
        WHERE managers.auth_user_id = auth.uid()
          AND managers.organisation_id IS NOT NULL
      )
    )
    OR
    -- Manager is directly linked to this specific location
    (
      id IN (
        SELECT managers.location_id
        FROM managers
        WHERE managers.auth_user_id = auth.uid()
          AND managers.location_id IS NOT NULL
      )
    )
  );
