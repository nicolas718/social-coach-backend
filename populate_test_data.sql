-- Create test user
INSERT OR REPLACE INTO users (device_id, created_at, current_streak, all_time_best_streak, last_completion_date)
VALUES ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', '2025-08-01', 0, 7, '2025-08-20');

-- Create 7-day streak of activities (Aug 14-20)
INSERT INTO daily_challenges (device_id, challenge_completed, challenge_was_successful, challenge_date, challenge_type)
VALUES 
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-14', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-15', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-16', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-17', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-18', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-19', 'eye_contact'),
  ('2FC3F7C4-9DF6-4164-99E2-909D6008BC02', 1, 1, '2025-08-20', 'eye_contact');
  
-- Note: Aug 21 is missed (no entry)
-- Note: Aug 22 is today (no entry yet)