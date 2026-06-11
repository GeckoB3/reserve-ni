-- Cross-venue cache of AI column-mapping results, keyed by the exact header
-- list. The same provider's export format recurs across customers, so most
-- mapping calls become instant cache hits — and the cache doubles as a growing
-- library of provider templates. Contains column HEADERS and field mappings
-- only — never row data.

CREATE TABLE IF NOT EXISTS import_ai_mapping_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headers_hash text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('clients', 'bookings')),
  headers jsonb NOT NULL,
  mappings jsonb NOT NULL,
  model text,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (headers_hash, file_type)
);

-- Service-role only (no venue scoping applies; accessed via the admin client).
ALTER TABLE import_ai_mapping_cache ENABLE ROW LEVEL SECURITY;
