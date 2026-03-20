-- Optional contact phone for venue staff (personal settings)

ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone text;
