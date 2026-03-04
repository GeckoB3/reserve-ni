-- Reserve NI Dev: Seed Test Restaurant + staff (Andrew Courtney)
-- Run this in Supabase SQL Editor for your dev project.
-- Then create the Auth user in Dashboard (see instructions below).

-- 1. Insert venue "Test Restaurant"
INSERT INTO venues (name, slug, timezone)
VALUES ('Test Restaurant', 'test-restaurant', 'Europe/London')
ON CONFLICT (slug) DO NOTHING;

-- 2. Insert staff linked to that venue (only if not already present)
INSERT INTO staff (venue_id, email, name, role)
SELECT v.id, 'andrewcourtney@gmail.com', 'Andrew Courtney', 'admin'
FROM venues v
WHERE v.slug = 'test-restaurant'
  AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.venue_id = v.id AND s.email = 'andrewcourtney@gmail.com');
