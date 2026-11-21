-- Developer-only, idempotent, persistent test data. Never seed production databases.
INSERT OR IGNORE INTO users(id,display_name,is_admin,last_active_at,is_test_data) VALUES
 ('test_admin','test_Server Admin',1,'2026-11-20T12:00:00.000Z',1),
 ('test_gm_a','test_GM A',0,'2026-11-20T12:00:00.000Z',1),
 ('test_gm_b','test_GM B',0,'2026-05-01T12:00:00.000Z',1),
 ('test_player_a','test_Player A',0,'2026-11-20T12:00:00.000Z',1),
 ('test_player_b','test_Player B',0,'2026-05-01T12:00:00.000Z',1);
INSERT OR IGNORE INTO campaigns(id,name,created_by,is_test_data) VALUES
 ('test_viking','test_Viking Saga','test_gm_a',1),
 ('test_eldrich','test_The Eldrich Race','test_gm_b',1),
 ('test_kanji','test_霧の王国','test_gm_a',1);
INSERT OR IGNORE INTO memberships(campaign_id,user_id,is_gm) VALUES
 ('test_viking','test_gm_a',1), ('test_viking','test_gm_b',1),
 ('test_viking','test_player_a',0), ('test_viking','test_player_b',0),
 ('test_eldrich','test_gm_b',1), ('test_eldrich','test_player_a',0),
 ('test_kanji','test_gm_a',1);
