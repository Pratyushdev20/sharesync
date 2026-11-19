-- Database Backup Before Feature 29 Migration
-- Timestamp: 2026-11-19T06:12:44.879Z

-- USERS (3 rows)
INSERT INTO users (id, name, email, password_hash, created_at, firebase_uid) VALUES (1, 'Pratyush', 'pratyush@example.com', 'temporary_hashed_password', '2026-08-24T14:00:45.973Z', NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, name, email, password_hash, created_at, firebase_uid) VALUES (3, 'rahul', 'rahul@gmail.com', 'fcvhu98ygfvb9ug', '2026-08-24T14:47:34.459Z', NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, name, email, password_hash, created_at, firebase_uid) VALUES (5, 'vivek', 'vivek@gmail.com', 'cghutfcvbhjuytgvbn', '2026-08-24T14:47:34.459Z', NULL) ON CONFLICT (id) DO NOTHING;

-- FOLDERS (2 rows)
INSERT INTO folders (id, name, owner_id, created_at, owner_firebase_uid, parent_folder_id, updated_at) VALUES (4, 'test', 1, '2026-08-24T15:12:31.822Z', NULL, null, '2026-11-16T18:29:32.976Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO folders (id, name, owner_id, created_at, owner_firebase_uid, parent_folder_id, updated_at) VALUES (6, 'test2', 3, '2026-08-24T15:12:31.822Z', NULL, null, '2026-11-16T18:29:32.976Z') ON CONFLICT (id) DO NOTHING;

-- FILES (1 rows)
INSERT INTO files (id, name, size, mime_type, storage_path, owner_id, folder_id, created_at, owner_firebase_uid, updated_at) VALUES (11, 'resume.pdf', 250000, 'application/pdf', '/users/1/files/resume.pdf', 1, 4, '2026-09-02T06:57:48.108Z', NULL, '2026-11-17T17:05:44.369Z') ON CONFLICT (id) DO NOTHING;
