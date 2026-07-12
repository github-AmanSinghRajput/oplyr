// Pure vector helpers for semantic recall. No DB, no model — just math + byte packing, so this is
// trivially testable and reused by both the embedding service (packing) and recall (scoring).
//
// Why brute-force cosine and not a vector index (sqlite-vec)? At beta scale (a few thousand atoms)
// scanning every vector is well under ~10ms, and it removes the single riskiest packaging
// dependency from the notarized build. A vector index is a pure speed optimization for later.

/** Pack a Float32 embedding into raw little-endian bytes for BLOB storage. */
export function vectorToBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/** Read a Float32 embedding back out of a BLOB. Copies so the DB buffer isn't aliased. */
export function blobToVector(blob: Buffer, dim: number): Float32Array {
  const out = new Float32Array(dim);
  // Guard against a short/corrupt blob rather than reading out of bounds.
  const usable = Math.min(dim, Math.floor(blob.byteLength / Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < usable; i += 1) {
    out[i] = blob.readFloatLE(i * Float32Array.BYTES_PER_ELEMENT);
  }
  return out;
}

/** Return a unit-length copy of the vector. A zero vector is returned unchanged. */
export function normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i += 1) {
    sumSquares += vector[i]! * vector[i]!;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) {
    return vector.slice();
  }
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    out[i] = vector[i]! / magnitude;
  }
  return out;
}

/**
 * Cosine similarity in [-1, 1]. Computes magnitudes so it's correct even if inputs aren't
 * pre-normalized. Mismatched lengths or a zero vector yield 0 (treated as "unrelated").
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
