-- Enable RLS and restrict writes for entreprise table
ALTER TABLE entreprise ENABLE ROW LEVEL SECURITY;

CREATE POLICY frontend_read_only
  ON entreprise
  FOR SELECT
  USING (true);

CREATE POLICY frontend_no_write
  ON entreprise
  FOR UPDATE
  USING (false);
