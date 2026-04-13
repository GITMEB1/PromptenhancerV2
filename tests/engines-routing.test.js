import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseRoute,
  clearBuiltInAiAvailabilityCache,
  getBuiltInAiAvailability,
  runRemoteUpgrade,
  runUpgrade,
  isValidRemoteUrl
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
  assert.ok(output.fallbackReason, 'Expected fallbackReason to be set');
});

test('runUpgrade sets heuristic-repair and diagnostics when remote returns invalid schema', async () => {
  globalThis.self = {};
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ bad: 'data', not: 'matching schema' })
  });

  clearBuiltInAiAvailabilityCache();

  const output = await runUpgrade({
    draft: 'Write a concise email about project status.',
    settings: {
      privacyMode: 'cloud-preferred',
      remoteEndpoint: 'https://example.com/upgrade',
      remoteApiKey: ''
    },
    context: { provider: 'chatgpt' }
  });

  assert.equal(output.engineUsed, 'heuristic-repair');
  assert.ok(output.fallbackReason, 'Expected fallbackReason to be set for schema failure');
  assert.match(output.fallbackReason, /schema/i);
  assert.ok(Array.isArray(output.schemaErrors), 'Expected schemaErrors array');
  assert.ok(output.schemaErrors.length > 0, 'Expected at least one schema error');
  assert.ok(output.result.improved_prompt.length > 0, 'Heuristic repair should produce a valid prompt');
});

test('runRemoteUpgrade uses remoteTimeoutMs from settings', async () => {
  let capturedSignal = null;
  globalThis.fetch = async (_url, opts) => {
    capturedSignal = opts.signal;
    return {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ some: 'data' })
    };
  };

  await runRemoteUpgrade(
    'test draft',
    { remoteEndpoint: 'https://example.com/upgrade', remoteTimeoutMs: 5000 },
    {}
  );

  assert.ok(capturedSignal, 'Expected AbortController signal to be passed to fetch');
  assert.equal(capturedSignal.aborted, false); // request completed before timeout
});

test('isValidRemoteUrl accepts valid URLs and rejects invalid ones', () => {
  // Empty is valid (means "not configured")
  assert.equal(isValidRemoteUrl(''), true);
  assert.equal(isValidRemoteUrl('  '), true);

  // Valid URLs
  assert.equal(isValidRemoteUrl('https://example.com/upgrade'), true);
  assert.equal(isValidRemoteUrl('http://localhost:3000/api'), true);

  // Invalid
  assert.equal(isValidRemoteUrl('not-a-url'), false);
  assert.equal(isValidRemoteUrl('ftp://example.com'), false);
  assert.equal(isValidRemoteUrl('javascript:alert(1)'), false);
});

