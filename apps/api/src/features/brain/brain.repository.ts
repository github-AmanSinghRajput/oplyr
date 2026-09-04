import { getBrainDatabase, isBrainDatabaseConfigured } from '../../db/brain-client.js';
import { withBrainTransaction } from '../../db/brain-transaction.js';
import type { AssistantProviderId } from '../../types.js';
import { blobToVector, vectorToBlob } from './brain-vectors.js';
import type {
  BrainAtomRecord,
  BrainAtomUpsert,
  BrainContributor,
  BrainEmbedding,
  BrainRecallCandidate,
  BrainSourceType,
  BrainStats
} from './brain.types.js';

interface BrainAtomRow {
  id: string;
  type: BrainAtomRecord['type'];
  text: string;
  normalized_text: string;
  scope: BrainAtomRecord['scope'];
  project_key: string | null;
  source_hash: string;
  sensitivity: BrainAtomRecord['sensitivity'];
  confidence: number;
  salience: number;
  provenance_json: string;
  entities_json: string;
  contributors_json: string;
  created_at: string;
  last_seen_at: string;
  deleted_at: string | null;
}

interface BrainCandidateRow extends BrainAtomRow {
  emb_dim: number | null;
  emb_vector: Buffer | null;
}

interface BrainRecallQueryOptions {
  includeCrossProject: boolean;
  includeSensitive: boolean;
  embeddingModel: string;
  limit?: number;
  /** Fallback current-project key: imported project memory is keyed by the absolute project root
   *  while live capture keys by the synthetic workspace id, so recall matches either. */
  projectRootKey?: string;
}

const PROVIDER_IDS: readonly AssistantProviderId[] = ['codex', 'claude', 'gemini'];
const MAX_ENTITIES_PER_ATOM = 16;
const CORROBORATION_BONUS = 0.05;

export class BrainRepository {
  /**
   * Insert new atoms or merge into existing ones (deduped by source_hash). Merging is a
   * read-modify-write inside the transaction because SQLite can't union JSON arrays in pure SQL:
   * entities are unioned, contributors deduped by provider, and a NEW contributing agent bumps
   * confidence/salience (corroboration makes the brain surer).
   */
  async upsertAtoms(atoms: BrainAtomUpsert[]): Promise<BrainAtomRecord[]> {
    if (!isBrainDatabaseConfigured() || atoms.length === 0) {
      return [];
    }

    const records: BrainAtomRecord[] = [];

    withBrainTransaction((database) => {
      const select = database.prepare('SELECT * FROM brain_atoms WHERE source_hash = ? LIMIT 1');
      const insert = database.prepare(`
        INSERT INTO brain_atoms (
          type, text, normalized_text, scope, project_key, source_hash, sensitivity,
          confidence, salience, provenance_json, entities_json, contributors_json,
          last_seen_at, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL)
      `);
      const update = database.prepare(`
        UPDATE brain_atoms
        SET text = ?, sensitivity = ?, confidence = ?, salience = ?,
            provenance_json = ?, entities_json = ?, contributors_json = ?,
            last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), deleted_at = NULL
        WHERE id = ?
      `);

      for (const atom of atoms) {
        const existing = select.get(atom.sourceHash) as BrainAtomRow | undefined;

        if (existing) {
          const entities = unionEntities(parseStringArray(existing.entities_json), atom.entities);
          const { contributors, added } = mergeContributor(
            parseContributors(existing.contributors_json),
            atom.contributor
          );
          const confidence = clamp01(
            Math.max(existing.confidence, atom.confidence) + (added ? CORROBORATION_BONUS : 0)
          );
          const salience = clamp01(
            Math.max(existing.salience, atom.salience) + (added ? CORROBORATION_BONUS : 0)
          );
          update.run(
            atom.text,
            atom.sensitivity,
            confidence,
            salience,
            JSON.stringify(atom.provenance),
            JSON.stringify(entities),
            JSON.stringify(contributors),
            existing.id
          );
        } else {
          insert.run(
            atom.type,
            atom.text,
            atom.normalizedText,
            atom.scope,
            atom.projectKey,
            atom.sourceHash,
            atom.sensitivity,
            clamp01(atom.confidence),
            clamp01(atom.salience),
            JSON.stringify(atom.provenance),
            JSON.stringify(dedupeEntities(atom.entities)),
            JSON.stringify([atom.contributor])
          );
        }

        const row = select.get(atom.sourceHash) as BrainAtomRow | undefined;
        if (row) {
          records.push(toAtomRecord(row));
        }
      }
    });

    return records;
  }

  /** Store (or replace) the embedding vector for an atom under the active model. */
  async upsertEmbedding(atomId: string, embedding: BrainEmbedding) {
    if (!isBrainDatabaseConfigured()) {
      return;
    }
    getBrainDatabase()
      .prepare(
        `
        INSERT INTO brain_embeddings (atom_id, model, dim, vector, embedded_at)
        VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(atom_id) DO UPDATE SET
          model = excluded.model,
          dim = excluded.dim,
          vector = excluded.vector,
          embedded_at = excluded.embedded_at
      `
      )
      .run(atomId, embedding.model, embedding.dim, vectorToBlob(embedding.vector));
  }

  /**
   * Recall candidate set: live, non-entity atoms scoped per the cross-project rules, each joined to
   * its embedding for the active model (null when not embedded → keyword fallback in recall).
   */
  async listRecallCandidates(
    projectKey: string,
    options: BrainRecallQueryOptions
  ): Promise<BrainRecallCandidate[]> {
    if (!isBrainDatabaseConfigured()) {
      return [];
    }

    const limit = options.limit ?? 300;
    const projectFilter = options.includeCrossProject
      ? "AND (a.scope = 'global' OR a.scope = 'project')"
      : "AND (a.scope = 'global' OR (a.scope = 'project' AND (a.project_key = @projectKey OR a.project_key = @projectRootKey)))";
    const sensitivityFilter = options.includeSensitive ? '' : "AND a.sensitivity = 'normal'";

    const rows = getBrainDatabase()
      .prepare(
        `
        SELECT a.*, e.dim AS emb_dim, e.vector AS emb_vector
        FROM brain_atoms a
        LEFT JOIN brain_embeddings e ON e.atom_id = a.id AND e.model = @model
        WHERE a.deleted_at IS NULL
          AND a.type != 'entity'
          ${projectFilter}
          ${sensitivityFilter}
        ORDER BY a.last_seen_at DESC
        LIMIT @limit
      `
      )
      .all({
        projectKey,
        projectRootKey: options.projectRootKey ?? projectKey,
        model: options.embeddingModel,
        limit
      }) as BrainCandidateRow[];

    return rows.map((row) => ({
      atom: toAtomRecord(row),
      embedding: row.emb_vector && row.emb_dim ? blobToVector(row.emb_vector, row.emb_dim) : null
    }));
  }

  async listRecentAtoms(limit = 40): Promise<BrainAtomRecord[]> {
    if (!isBrainDatabaseConfigured()) {
      return [];
    }
    const rows = getBrainDatabase()
      .prepare(
        `
        SELECT * FROM brain_atoms
        WHERE deleted_at IS NULL AND type != 'entity'
        ORDER BY last_seen_at DESC
        LIMIT ?
      `
      )
      .all(limit) as BrainAtomRow[];
    return rows.map(toAtomRecord);
  }

  /** All live atoms (bounded), for building the graph view. */
  async listGraphAtoms(limit = 120): Promise<BrainAtomRecord[]> {
    if (!isBrainDatabaseConfigured()) {
      return [];
    }
    const rows = getBrainDatabase()
      .prepare(
        `
        SELECT * FROM brain_atoms
        WHERE deleted_at IS NULL AND type != 'entity'
        ORDER BY salience DESC, last_seen_at DESC
        LIMIT ?
      `
      )
      .all(limit) as BrainAtomRow[];
    return rows.map(toAtomRecord);
  }

  async getStats(projectKey: string | null): Promise<BrainStats> {
    if (!isBrainDatabaseConfigured()) {
      return { totalAtoms: 0, projectAtoms: 0, globalAtoms: 0, deletedAtoms: 0 };
    }

    const database = getBrainDatabase();
    const total = database
      .prepare(
        "SELECT COUNT(*) AS count FROM brain_atoms WHERE deleted_at IS NULL AND type != 'entity'"
      )
      .get() as { count: number };
    const global = database
      .prepare(
        "SELECT COUNT(*) AS count FROM brain_atoms WHERE deleted_at IS NULL AND type != 'entity' AND scope = 'global'"
      )
      .get() as { count: number };
    const project = projectKey
      ? (database
          .prepare(
            "SELECT COUNT(*) AS count FROM brain_atoms WHERE deleted_at IS NULL AND type != 'entity' AND scope = 'project' AND project_key = ?"
          )
          .get(projectKey) as { count: number })
      : { count: 0 };
    const deleted = database
      .prepare('SELECT COUNT(*) AS count FROM brain_atoms WHERE deleted_at IS NOT NULL')
      .get() as { count: number };

    return {
      totalAtoms: total.count,
      projectAtoms: project.count,
      globalAtoms: global.count,
      deletedAtoms: deleted.count
    };
  }

  async deleteAtom(atomId: string) {
    if (!isBrainDatabaseConfigured()) {
      return false;
    }
    const result = getBrainDatabase()
      .prepare(
        `
        UPDATE brain_atoms
        SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND deleted_at IS NULL
      `
      )
      .run(atomId);
    return result.changes > 0;
  }

  async archiveRawSource(input: {
    sourceType: BrainSourceType;
    sourceHash: string;
    compressedBlob: Buffer;
    metadata: Record<string, unknown>;
  }) {
    if (!isBrainDatabaseConfigured()) {
      return;
    }
    getBrainDatabase()
      .prepare(
        `
        INSERT INTO brain_raw_archive (source_type, source_hash, compressed_blob, metadata_json, deleted_at)
        VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(source_hash) DO UPDATE SET
          compressed_blob = excluded.compressed_blob,
          metadata_json = excluded.metadata_json,
          deleted_at = NULL
      `
      )
      .run(
        input.sourceType,
        input.sourceHash,
        input.compressedBlob,
        JSON.stringify(input.metadata)
      );
  }

  /** Import ledger snapshot: absolute source path → last-import fingerprint, for scan de-duplication.
   *  `database` is injectable so tests can drive a temp brain DB; production uses the singleton. */
  listImportSources(
    database: ReturnType<typeof getBrainDatabase> = getBrainDatabase()
  ): Map<string, { contentHash: string; atomsAdded: number; importedAt: string }> {
    const result = new Map<
      string,
      { contentHash: string; atomsAdded: number; importedAt: string }
    >();
    if (!isBrainDatabaseConfigured()) {
      return result;
    }
    const rows = database
      .prepare('SELECT path, content_hash, atoms_added, imported_at FROM brain_import_sources')
      .all() as Array<{
      path: string;
      content_hash: string;
      atoms_added: number;
      imported_at: string;
    }>;
    for (const row of rows) {
      result.set(row.path, {
        contentHash: row.content_hash,
        atomsAdded: Number(row.atoms_added),
        importedAt: row.imported_at
      });
    }
    return result;
  }

  /** Record (or refresh) a source in the import ledger. Best-effort caller — never blocks an import.
   *  A re-import of an unchanged source stores 0 new atoms, so we keep the prior count rather than
   *  overwriting it with 0. */
  upsertImportSource(
    row: {
      path: string;
      providerId: string;
      kind: 'global' | 'project' | 'session';
      projectKey: string | null;
      contentHash: string;
      atomsAdded: number;
    },
    database: ReturnType<typeof getBrainDatabase> = getBrainDatabase()
  ) {
    if (!isBrainDatabaseConfigured()) {
      return;
    }
    database
      .prepare(
        `
        INSERT INTO brain_import_sources (path, provider_id, kind, project_key, content_hash, atoms_added, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(path) DO UPDATE SET
          provider_id = excluded.provider_id,
          kind = excluded.kind,
          project_key = excluded.project_key,
          content_hash = excluded.content_hash,
          atoms_added = CASE WHEN excluded.atoms_added > 0 THEN excluded.atoms_added ELSE brain_import_sources.atoms_added END,
          imported_at = excluded.imported_at
      `
      )
      .run(row.path, row.providerId, row.kind, row.projectKey, row.contentHash, row.atomsAdded);
  }

  async resetAll() {
    if (!isBrainDatabaseConfigured()) {
      return;
    }
    withBrainTransaction((database) => {
      database.exec('DELETE FROM brain_embeddings');
      database.exec('DELETE FROM brain_edges');
      database.exec('DELETE FROM brain_raw_archive');
      database.exec('DELETE FROM brain_atoms');
      database.exec('DELETE FROM brain_entities');
      database.exec('DELETE FROM brain_preferences');
      database.exec('DELETE FROM brain_import_sources');
    });
  }
}

// ── mapping + merge helpers ───────────────────────────────────────────────────────────────────

function toAtomRecord(row: BrainAtomRow): BrainAtomRecord {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    normalizedText: row.normalized_text,
    scope: row.scope,
    projectKey: row.project_key,
    sourceHash: row.source_hash,
    sensitivity: row.sensitivity,
    confidence: Number(row.confidence),
    salience: Number(row.salience),
    provenance: parseProvenance(row.provenance_json),
    entities: parseStringArray(row.entities_json),
    contributors: parseContributors(row.contributors_json),
    createdAt: new Date(row.created_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null
  };
}

function parseProvenance(value: string): BrainAtomRecord['provenance'] {
  try {
    const parsed = JSON.parse(value) as BrainAtomRecord['provenance'];
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.source === 'string' &&
      typeof parsed.providerId === 'string'
    ) {
      return parsed;
    }
  } catch {
    /* ignore malformed provenance */
  }
  return {
    source: 'chat_turn',
    providerId: 'codex',
    sessionId: null,
    userMessageId: null,
    assistantMessageId: null,
    projectRoot: null,
    capturedAt: new Date(0).toISOString()
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    /* ignore */
  }
  return [];
}

function parseContributors(value: string): BrainContributor[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is BrainContributor =>
          !!item &&
          typeof item === 'object' &&
          PROVIDER_IDS.includes((item as BrainContributor).providerId)
      )
      .map((item) => ({
        providerId: item.providerId,
        sessionId: typeof item.sessionId === 'string' ? item.sessionId : null,
        lastAssertedAt:
          typeof item.lastAssertedAt === 'string' ? item.lastAssertedAt : new Date(0).toISOString()
      }));
  } catch {
    return [];
  }
}

function dedupeEntities(entities: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entities) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name.length < 2 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_ENTITIES_PER_ATOM) {
      break;
    }
  }
  return out;
}

function unionEntities(existing: string[], incoming: string[]): string[] {
  return dedupeEntities([...existing, ...incoming]);
}

/** Add or refresh a contributor. `added` is true only when this provider wasn't already present. */
function mergeContributor(existing: BrainContributor[], next: BrainContributor) {
  const index = existing.findIndex((item) => item.providerId === next.providerId);
  if (index === -1) {
    return { contributors: [...existing, next], added: true };
  }
  const contributors = existing.slice();
  contributors[index] = {
    ...contributors[index]!,
    sessionId: next.sessionId,
    lastAssertedAt: next.lastAssertedAt
  };
  return { contributors, added: false };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
