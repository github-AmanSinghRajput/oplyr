-- Two denormalized JSON columns on atoms:
--   entities_json     – the named things a memory is about (distiller-extracted). The Memory graph's
--                       edges are a deterministic function of shared entities — real data, not the
--                       old frontend text-similarity guesswork.
--   contributors_json – which agents have asserted this memory (deduped). Powers "which AI said what"
--                       and lets corroboration by a second agent raise confidence/salience.
ALTER TABLE brain_atoms ADD COLUMN entities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE brain_atoms ADD COLUMN contributors_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_brain_atoms_type_deleted
  ON brain_atoms(type, deleted_at);
