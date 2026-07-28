import test from 'node:test';
import assert from 'node:assert/strict';

import { validateUpgradeResult, collectSchemaErrors, VALID_TASK_TYPES } from '../src/schema.js';

function makeValidResult(overrides = {}) {
  return {
    task_type: 'build',
    intent: {
      primary_goal: 'Build a clarity engine.',
      desired_outcome: 'Produce an implementation-ready result.',
      user_context: 'The user has a rough request.',
      target_audience: 'AI tool users.',
      quality_bar: 'Maximum practical clarity and goal fidelity.',
      success_criteria: ['Preserve intent.'],
      hard_constraints: [],
      soft_preferences: [],
      non_goals: ['Do not add filler.']
    },
    interpretation: { summary: 'The user wants a clarity-first tool.', important_cues: [] },
    ambiguities: [],
    assumptions: [],
    clarified_brief: 'Primary goal: Build a clarity engine.',
    compiled_prompt: 'Build a clarity engine with explicit success criteria.',
    improved_prompt: 'Build a clarity engine with explicit success criteria.',
    variants: {
      concise: 'Build a clarity engine.',
      deep: 'Build a deeply specified clarity engine.',
      implementation_spec: 'OBJECTIVE\nBuild the clarity engine.',
      rigorous: 'Build a deeply specified clarity engine.',
      agent_spec: 'OBJECTIVE\nBuild the clarity engine.'
    },
    safety_notes: [],
    confidence: 0.8,
    ...overrides
  };
}

test('validateUpgradeResult accepts a complete clarity result', () => {
  assert.equal(validateUpgradeResult(makeValidResult()).ok, true);
});

test('legacy prompt-only results are rejected', () => {
  const result = validateUpgradeResult({ task_type: 'write', improved_prompt: 'Rewrite this.' });
  assert.equal(result.ok, false);
  assert.match(result.error, /intent/i);
});

test('missing primary goal is rejected', () => {
  const value = makeValidResult();
  value.intent.primary_goal = '';
  assert.match(validateUpgradeResult(value).error, /primary_goal/i);
});

test('missing interpretation summary is rejected', () => {
  const value = makeValidResult();
  value.interpretation.summary = '';
  assert.match(validateUpgradeResult(value).error, /interpretation/i);
});

test('collectSchemaErrors returns multiple clarity violations', () => {
  const errors = collectSchemaErrors({ task_type: 'dance', intent: {}, interpretation: {}, ambiguities: 'bad', assumptions: 'bad' });
  assert.ok(errors.length >= 5);
});

test('VALID_TASK_TYPES includes analysis and decision work', () => {
  assert.ok(VALID_TASK_TYPES.has('analyse'));
  assert.ok(VALID_TASK_TYPES.has('decide'));
});
