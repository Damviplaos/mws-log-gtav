
-- outhai's password was hashed with bcrypt cost=6 ($2a$06$).
-- GoTrue requires minimum cost=10; re-hash with cost=10 using pgcrypto.
UPDATE auth.users
SET encrypted_password = crypt('56110669', gen_salt('bf', 10)),
    updated_at = now()
WHERE email = 'outhai@gta-fivem.local'
  AND left(encrypted_password, 6) = '$2a$06';
