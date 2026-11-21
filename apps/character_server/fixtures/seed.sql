-- Developer-only, idempotent, persistent test data. Never seed production databases.
INSERT OR IGNORE INTO users(id,display_name,is_admin,last_active_at,is_test_data) VALUES
 ('test_admin','test_Server Admin',1,'2026-11-20T12:00:00.000Z',1),
 ('test_gm_a','test_GM A',0,'2026-11-20T12:00:00.000Z',1),
 ('test_gm_b','test_GM B',0,'2026-05-01T12:00:00.000Z',1),
 ('test_player_a','test_Player A',0,'2026-11-20T12:00:00.000Z',1),
 ('test_player_b','test_Player B',0,'2026-05-01T12:00:00.000Z',1),
 -- Invitation workflow: these users start with no campaign membership.
 ('test_creator','test_Campaign Creator (player, no admin rights)',0,'2026-11-20T12:00:00.000Z',1),
 ('test_single_invitee','test_Personal Invite Recipient',0,'2026-11-20T12:00:00.000Z',1),
 ('test_group_invitee_a','test_Group Invite Recipient A',0,'2026-11-20T12:00:00.000Z',1),
 ('test_group_invitee_b','test_Group Invite Recipient B',0,'2026-11-20T12:00:00.000Z',1),
 ('test_group_overflow','test_Group Invite Overflow (rejected)',0,'2026-11-20T12:00:00.000Z',1),
 ('test_gm_invitee','test_GM Invite Recipient',0,'2026-11-20T12:00:00.000Z',1),
 ('test_uninvited','test_Uninvited Outsider',0,'2026-11-20T12:00:00.000Z',1);
INSERT OR IGNORE INTO campaigns(id,name,created_by,is_test_data) VALUES
 ('test_viking','test_Viking Saga','test_gm_a',1),
 ('test_eldrich','test_The Eldrich Race','test_gm_b',1),
 ('test_kanji','test_霧の王国','test_gm_a',1);
INSERT OR IGNORE INTO memberships(campaign_id,user_id,is_gm) VALUES
 ('test_viking','test_gm_a',1), ('test_viking','test_gm_b',1),
 ('test_viking','test_player_a',0), ('test_viking','test_player_b',0),
 ('test_eldrich','test_gm_b',1), ('test_eldrich','test_player_a',0),
 ('test_kanji','test_gm_a',1);

-- Baseline character fixtures: the reset command removes temporary test
-- characters and restores these exact IDs with their canonical assignments.
INSERT OR IGNORE INTO characters(id,campaign_id,name,character_sheet_tokens,uploaded_by) VALUES
 ('test_hero_a','test_viking','test_Auðun','{"skill":"4.3","culture":"Norse"}','test_player_a'),
 ('test_shared_hero','test_viking','test_Shared Wanderer','{"skill":"3.5","role":"shared PC"}','test_gm_a'),
 ('test_npc','test_eldrich','test_Watch Captain','{"skill":"5.0","role":"GM character"}','test_gm_b');
INSERT OR IGNORE INTO character_players(character_id,user_id,assigned_by) VALUES
 ('test_hero_a','test_player_a','test_player_a'),
 ('test_shared_hero','test_player_a','test_gm_a'),
 ('test_shared_hero','test_player_b','test_gm_a');
INSERT OR IGNORE INTO character_notes(id,character_id,author_id,visibility,body) VALUES
 ('test_shared_note','test_shared_hero','test_player_a','shared','Shared clue: the old road leads north.'),
 ('test_private_a','test_shared_hero','test_player_a','private','Private clue for player A only.'),
 ('test_private_b','test_shared_hero','test_player_b','private','Private clue for player B only.'),
 ('test_private_gm','test_shared_hero','test_gm_a','private','GM-only personal reminder.');
