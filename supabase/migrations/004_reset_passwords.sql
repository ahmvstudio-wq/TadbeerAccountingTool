-- Reset passwords to 'operationaccountingtadbeer2026' for all users
UPDATE auth.users
SET encrypted_password = crypt('operationaccountingtadbeer2026', gen_salt('bf'));

-- Seed w.taufiqq@gmail.com if not exists
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a8b9c1d2-e3f4-5678-abcd-1234567890a1',
  'authenticated', 'authenticated', 'w.taufiqq@gmail.com',
  crypt('operationaccountingtadbeer2026', gen_salt('bf')),
  now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  'a8b9c1d2-e3f4-5678-abcd-1234567890a1',
  'a8b9c1d2-e3f4-5678-abcd-1234567890a1',
  jsonb_build_object('sub', 'a8b9c1d2-e3f4-5678-abcd-1234567890a1', 'email', 'w.taufiqq@gmail.com'),
  'email', now(), now(), now()
) ON CONFLICT (provider, id) DO NOTHING;

-- Seed operation@tadbeertt.com if not exists
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a8b9c1d2-e3f4-5678-abcd-1234567890a2',
  'authenticated', 'authenticated', 'operation@tadbeertt.com',
  crypt('operationaccountingtadbeer2026', gen_salt('bf')),
  now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  'a8b9c1d2-e3f4-5678-abcd-1234567890a2',
  'a8b9c1d2-e3f4-5678-abcd-1234567890a2',
  jsonb_build_object('sub', 'a8b9c1d2-e3f4-5678-abcd-1234567890a2', 'email', 'operation@tadbeertt.com'),
  'email', now(), now(), now()
) ON CONFLICT (provider, id) DO NOTHING;
