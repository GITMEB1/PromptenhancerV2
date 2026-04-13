import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseRoute,
  clearBuiltInAiAvailabilityCache,
  getBuiltInAiAvailability,
  runRemoteUpgrade,
  runUpgrade
} from '../src/engines.js';

test('chooseRoute uses explicit decision branches', () => {
  const cloudPreferred = chooseRoute({
    privacyMode: 'cloud-preferred',
    localAvailable: true,
    complexityScore: 1,
    taskTypeHint: 'write',
    remoteEndpoint: 'https://example.com/upgrade'
  });
  assert.equal(cloudPreferred.engine, 'remote');
  assert.equal(cloudPreferred.decision, 'policy-cloud-preferred');

  const localOnlyNoBuiltin = chooseRoute({
    privacyMode: 'local-only',
    localAvailable: false,
    complexityScore: 5,
    taskTypeHint: 'build',
    remoteEndpoint: 'https://example.com/upgrade'
  });
  assert.equal(localOnlyNoBuiltin.engine, 'heuristic');
  assert.equal(localOnlyNoBuiltin.decision, 'policy-local-only-fallback');
});

test('built-in availability probe requires callable API methods, not symbol presence only', async () => {
  globalThis.self = {
    Rewriter: {},
    LanguageModel: {
      availability: async () => 'unavailable',
      create: async () => ({ prompt: async () => 'unused' })
    }
  };

  clearBuiltInAiAvailabilityCache();
  const availability = await getBuiltInAiAvailability({ forceRefresh: true });

  assert.equal(availability.available, false);
  assert.equal(availability.rewriter.supported, false);
  assert.match(availability.rewriter.reason, /missing required methods/i);
});

test('runRemoteUpgrade rejects non-JSON responses with classified transport errors', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'text/html']]),
    json: async () => ({})
  });

  await assert.rejects(
    runRemoteUpgrade('draft', { remoteEndpoint: 'https://example.com/upgrade' }, {}),
    (error) => error?.name === 'RemoteTransportError' && error?.code === 'invalid_content_type'
  );
});

test('runUpgrade falls back to heuristic when remote transport fails', async () => {
  globalThis.self = {};
  globalThis.fetch = async () => {
    throw new Error('socket hang up');
  };

  clearBuiltInAiAvailabilityCache();

  const output = await runUpgrade({
    draft: 'Build a Chrome extension architecture with acceptance criteria.',
    settings: {
      privacyMode: 'cloud-preferred',
      remoteEndpoint: 'https://example.com/upgrade',
      remoteApiKey: ''
    },
    context: { provider: 'chatgpt' }
  });

  assert.equal(output.route.engine, 'remote');
  assert.equal(output.engineUsed, 'heuristic-fallback-remote');
  assert.equal(typeof output.result.improved_prompt, 'string');
  assert.ok(output.result.improved_prompt.length > 0);
});
