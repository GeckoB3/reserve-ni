-- Bootstrap a Reserve NI platform (super) user in Supabase Auth.
--
-- What this app expects (see `src/lib/platform-auth.ts`):
--   - `app_metadata.platform_role` = "superuser"  →  `raw_app_meta_data` in `auth.users`
--   - Email in Vercel `PLATFORM_SUPERUSER_EMAILS` or /super will block access
--
-- Run: Supabase Dashboard → SQL → New query
--
-- Edit `target_email` and `target_password` in the DO block (do not commit real passwords).
--
-- Behaviour:
--   1) If a user with that email already exists → UPDATE password, confirm email, set superuser metadata.
--   2) If not → INSERT into `auth.users` and `auth.identities` (email sign-in needs both).
--
-- If an INSERT errors on column names, your GoTrue version may differ: run
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'auth' AND table_name IN ('users', 'identities') ORDER BY table_name, ordinal_position;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  -- ▼ Edit these
  target_email    text := trim('andrewcourtney@gmail.com');
  target_password text := 'REPLACE_WITH_YOUR_PASSWORD';
  -- ▲
  v_user_id        uuid;
  v_instance_id    uuid;
  v_encrypted      text;
  v_app_meta       jsonb;
  updated_count    int;
BEGIN
  IF target_email = '' OR target_email IS NULL THEN
    RAISE EXCEPTION 'Set target_email';
  END IF;
  IF target_password = 'REPLACE_WITH_YOUR_PASSWORD' OR length(target_password) < 8 THEN
    RAISE EXCEPTION 'Set target_password to the real password (min 8 characters)';
  END IF;

  v_encrypted := crypt(target_password, gen_salt('bf'));
  v_app_meta :=
    '{"provider":"email","providers":["email"]}'::jsonb
    || jsonb_build_object('platform_role', 'superuser');

  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  /* ----- Existing user: just update ----- */
  UPDATE auth.users
  SET
    encrypted_password  = v_encrypted,
    email_confirmed_at  = coalesce(email_confirmed_at, now()),
    raw_app_meta_data   = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('platform_role', 'superuser'),
    updated_at          = now()
  WHERE lower(email) = lower(target_email);

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    RAISE NOTICE 'Updated existing user % (platform superuser metadata + password).', target_email;
    RETURN;
  END IF;

  /* ----- New user: create in auth.users + auth.identities ----- */
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    v_instance_id,
    v_user_id,
    'authenticated',
    'authenticated',
    target_email,
    v_encrypted,
    now(),
    v_app_meta,
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  /* Email provider identity (required for password sign-in in current Supabase Auth). */
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', target_email,
      'email_verified', true
    ),
    'email',
    now(),
    now(),
    now()
  );

  RAISE NOTICE 'Created new user % with id % (and email identity).', target_email, v_user_id;
END $$;

-- Verify:
-- SELECT u.id, u.email, u.email_confirmed_at, u.raw_app_meta_data
-- FROM auth.users u
-- WHERE lower(u.email) = lower('andrewcourtney@gmail.com');
-- SELECT * FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = lower('andrewcourtney@gmail.com'));
