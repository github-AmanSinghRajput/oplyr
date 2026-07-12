ALTER TABLE brain_atoms ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'normal'
  CHECK (sensitivity IN ('normal', 'sensitive'));

CREATE INDEX IF NOT EXISTS idx_brain_atoms_recall_mode
  ON brain_atoms(scope, project_key, sensitivity, deleted_at);
