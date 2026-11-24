-- Developer reset: preserve normal campaigns/accounts and the canonical seed fixtures.
-- Deliberately targets is_test_data=1, never a campaign name prefix.
-- Baseline campaigns are restored to canonical state by the subsequent seed step.
-- KEEP IN SYNC with seed.sql; add deletion for new test-only dependent tables as needed.
-- Delete only audit entries whose targets belong to a test campaign.
-- Do this before removing the referenced notes and characters, so normal
-- campaign audit history survives even when the actor is a simulated user.
DELETE FROM audit_events WHERE
 (action IN ('character.upload','character.assign')
  AND target_id IN (
   SELECT c.id FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id
   WHERE ca.is_test_data=1
  ))
 OR (action='note.create' AND target_id IN (
   SELECT n.id FROM character_notes n JOIN characters c ON c.id=n.character_id
   JOIN campaigns ca ON ca.id=c.campaign_id WHERE ca.is_test_data=1
  ));

-- Synchronization state for test resources must be removed before deleting
-- parent characters and notes. Normal campaigns are deliberately untouched.
DELETE FROM sync_receipts WHERE
 (kind='character.replace' AND resource_id IN (
   SELECT c.id FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id
   WHERE ca.is_test_data=1
 ))
 OR (kind='note.replace' AND resource_id IN (
   SELECT n.id FROM character_notes n JOIN characters c ON c.id=n.character_id
   JOIN campaigns ca ON ca.id=c.campaign_id WHERE ca.is_test_data=1
 ));
DELETE FROM note_revisions WHERE note_id IN (
 SELECT n.id FROM character_notes n JOIN characters c ON c.id=n.character_id
 JOIN campaigns ca ON ca.id=c.campaign_id WHERE ca.is_test_data=1
);
DELETE FROM character_revisions WHERE character_id IN (
 SELECT c.id FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id
 WHERE ca.is_test_data=1
);

-- Delete dependent records first, then character rows. Normal campaigns and
-- their characters remain untouched.
DELETE FROM character_notes WHERE character_id IN (
 SELECT c.id FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id
 WHERE ca.is_test_data=1
);
DELETE FROM character_players WHERE character_id IN (
 SELECT c.id FROM characters c JOIN campaigns ca ON ca.id=c.campaign_id
 WHERE ca.is_test_data=1
);
DELETE FROM characters WHERE campaign_id IN (
 SELECT id FROM campaigns WHERE is_test_data=1
);

-- Remove audit events referencing test invitations BEFORE removing the invitations.
DELETE FROM audit_events
 WHERE target_id IN (
   SELECT i.id FROM invitations i JOIN campaigns c ON c.id=i.campaign_id
   WHERE c.is_test_data=1
 )
 OR target_id IN (SELECT id FROM campaigns WHERE is_test_data=1)
 OR (action IN ('admin.promote','admin.revoke')
     AND target_id IN (SELECT id FROM users WHERE is_test_data=1));

-- Clear invitation usage for both baseline and ad-hoc test campaigns.
DELETE FROM invitations WHERE campaign_id IN (SELECT id FROM campaigns WHERE is_test_data=1);

-- Clear all memberships in test campaigns, including promoted GMs and joined users.
-- Do NOT touch memberships of normal campaigns.
DELETE FROM memberships WHERE campaign_id IN (SELECT id FROM campaigns WHERE is_test_data=1);

-- Keep precisely the baseline test campaigns and their stable identifiers.
DELETE FROM campaigns
 WHERE is_test_data=1
   AND id NOT IN ('test_viking','test_eldrich','test_kanji');

-- Reset simulated account privileges and timestamps, without deleting users.
UPDATE users SET
 is_admin=CASE WHEN id='test_admin' THEN 1 ELSE 0 END,
 last_active_at=CASE
   WHEN id IN ('test_gm_b','test_player_b') THEN '2026-05-01T12:00:00.000Z'
   ELSE '2026-11-20T12:00:00.000Z'
 END
 WHERE is_test_data=1 AND id IN (
   'test_admin','test_gm_a','test_gm_b','test_player_a','test_player_b',
   'test_creator','test_single_invitee','test_group_invitee_a',
   'test_group_invitee_b','test_group_overflow','test_gm_invitee','test_uninvited'
 );

-- The original baseline membership rows are reinserted by seed.sql.
