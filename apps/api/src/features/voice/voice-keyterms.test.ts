import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeyterms, MAX_KEYTERMS, splitIdentifier } from './voice-keyterms.js';

const textsOf = (terms: { text: string }[]) => terms.map((t) => t.text);

test('splitIdentifier handles every case style a codebase mixes', () => {
  assert.deepEqual(splitIdentifier('MemoryImportPanel'), ['Memory', 'Import', 'Panel']);
  assert.deepEqual(splitIdentifier('voice-keyterms'), ['voice', 'keyterms']);
  assert.deepEqual(splitIdentifier('brain_import_ledger'), ['brain', 'import', 'ledger']);
  assert.deepEqual(splitIdentifier('chat.service'), ['chat', 'service']);
  // Acronym runs must not shatter into single letters.
  assert.deepEqual(splitIdentifier('HTTPSProxyAgent'), ['HTTPS', 'Proxy', 'Agent']);
});

test('buildKeyterms puts the project name first and weights it hardest', () => {
  const terms = buildKeyterms({ projectName: 'vocod' });
  assert.equal(terms[0]?.text, 'vocod');
  assert.ok(terms[0]!.weight > terms[terms.length - 1]!.weight);
});

test('buildKeyterms takes the words out of a branch, not the slug', () => {
  const texts = textsOf(buildKeyterms({ branch: 'revamp/audit-fixes' }));
  assert.ok(texts.includes('revamp'));
  assert.ok(texts.includes('audit'));
  assert.ok(texts.includes('fixes'));
  assert.ok(!texts.includes('revamp/audit-fixes'), 'nobody says the slug out loud');
});

test('buildKeyterms emits a filename as the phrase a person would speak', () => {
  const texts = textsOf(
    buildKeyterms({ filePaths: ['apps/web/src/components/MemoryImportPanel.tsx'] })
  );
  assert.ok(texts.includes('Memory Import Panel'), 'expected the spoken phrase');
  assert.ok(texts.includes('Memory'), 'and the component words');
});

test('buildKeyterms drops generic path noise', () => {
  const texts = textsOf(buildKeyterms({ filePaths: ['src/lib/utils/index.ts'] })).map((t) =>
    t.toLowerCase()
  );
  for (const noise of ['src', 'lib', 'utils', 'index']) {
    assert.ok(!texts.includes(noise), `${noise} should not be biased for`);
  }
});

test('buildKeyterms strips only the final extension', () => {
  const texts = textsOf(buildKeyterms({ filePaths: ['src/voice-keyterms.test.ts'] }));
  assert.ok(texts.some((t) => t.includes('keyterms')));
  assert.ok(!texts.includes('ts'));
});

test('buildKeyterms de-duplicates case-insensitively and keeps the strongest weight', () => {
  const terms = buildKeyterms({
    projectName: 'Brain',
    filePaths: ['src/brain/brain.service.ts', 'src/brain/brain.repository.ts']
  });
  const brain = terms.filter((t) => t.text.toLowerCase() === 'brain');
  assert.equal(brain.length, 1, 'one entry only');
  assert.equal(brain[0]?.text, 'Brain', 'the project spelling wins');
});

test('buildKeyterms ranks recurring fragments above one-offs', () => {
  const texts = textsOf(
    buildKeyterms({
      filePaths: [
        'a/approval-gate.ts',
        'b/approval-list.ts',
        'c/approval-detail.ts',
        'd/zebra-oddity.ts'
      ]
    })
  );
  assert.ok(texts.indexOf('approval') < texts.indexOf('zebra'), 'repeated terms come first');
});

test('buildKeyterms always includes the coding terms that get misheard', () => {
  const texts = textsOf(buildKeyterms({}));
  for (const term of ['refactor', 'TypeScript', 'dependency', 'GitHub']) {
    assert.ok(texts.includes(term), `${term} missing`);
  }
});

test('buildKeyterms caps the vocabulary and keeps the highest-value terms', () => {
  const filePaths = Array.from({ length: 400 }, (_, i) => `src/generated-module-${i}/thing${i}.ts`);
  const terms = buildKeyterms({ projectName: 'oplyr', branch: 'main', filePaths });

  assert.ok(terms.length <= MAX_KEYTERMS, `expected <= ${MAX_KEYTERMS}, got ${terms.length}`);
  assert.equal(terms[0]?.text, 'oplyr', 'the project name survives the trim');
});
