import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateUpgradeResult,
  collectSchemaErrors,
  VALID_TASK_TYPES
} from '../src/schema.js';

function makeValidResult(overrides = {}) {
  return {
    task_type: 'write',
    improved_prompt: 'A clearer prompt.',
    assumptions: ['User wants a draft.'],
    missing_constraints: [],
    clarifying_questions: [],
    variants: {
      concise: 'Short version.',
      rigorous: 'Detailed version.',
      agent_spec: 'Agent spec version.'
    },
    safety_notes: [],
    confidence: 0.48,
    ...overrides
  };
}

test('validateUpgradeResult accepts a valid result', () => {
  const result = validateUpgradeResult(makeValidResult());
  assert.equal(result.ok, true);
});

test('validateUpgradeResult rejects null input', () => {
  const result = validateUpgradeResult(null);
  assert.equal(result.ok, false);
  assert.match(result.error, /not an object/i);
});

test('validateUpgradeResult rejects invalid task_type', () => {
  const result = validateUpgradeResult(makeValidResult({ task_type: 'dance' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /task_type/i);
});

test('validateUpgradeResult rejects missing improved_prompt', () => {
  const result = validateUpgradeResult(makeValidResult({ improved_prompt: '' }));
  assert.equal(result.ok, false);
  assert.match(result.error, /improved_prompt/i);
});

test('validateUpgradeResult rejects confidence out of range', () => {
  const result = validateUpgradeResult(makeValidResult({ confidence: 1.5 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /confidence/i);
});

test('validateUpgradeResult rejects missing variant fields', () => {
  const result = validateUpgradeResult(makeValidResult({ variants: { concise: 'ok', rigorous: 'ok', agent_spec: '' } }));
  assert.equal(result.ok, false);
  assert.match(result.error, /agent_spec/i);
});

test('collectSchemaErrors returns all violations at once', () => {
  const errors = collectSchemaErrors({
    task_type: 'invalid',
    improved_prompt: '',
    assumptions: 'not-an-array',
    missing_constraints: [],
    clarifying_questions: [],
    variants: { concise: '', rigorous: '', agent_spec: '' },
    safety_notes: [],
    confidence: -1
  });

  assert.ok(errors.length >= 5, `Expected at least 5 errors, got ${errors.length}: ${errors.join('; ')}`);
  assert.ok(errors.some(e => /task_type/i.test(e)));
  assert.ok(errors.some(e => /improved_prompt/i.test(e)));
  assert.ok(errors.some(e => /assumptions/i.test(e)));
  assert.ok(errors.some(e => /confidence/i.test(e)));
});

test('collectSchemaErrors returns empty array for valid input', () => {
  const errors = collectSchemaErrors(makeValidResult());
  assert.equal(errors.length, 0);
});

test('collectSchemaErrors handles missing variants object', () => {
  const errors = collectSchemaErrors(makeValidResult({ variants: null }));
  assert.ok(errors.some(e => /variants/i.test(e)));
  // When variants is null, individual variant errors should NOT be reported
  assert.ok(!errors.some(e => /concise/i.test(e)));
});

test('VALID_TASK_TYPES contains expected set', () => {
  assert.equal(VALID_TASK_TYPES.size, 6);
  for (const t of ['explain', 'research', 'write', 'edit', 'build', 'plan']) {
    assert.ok(VALID_TASK_TYPES.has(t));
  }
});
