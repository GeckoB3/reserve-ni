-- Storage bucket for floor plan background images.
-- Uploads are done server-side via API (admin client). Public read for display.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'floor-plan-backgrounds',
  'floor-plan-backgrounds',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "floor_plan_background_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'floor-plan-backgrounds');
