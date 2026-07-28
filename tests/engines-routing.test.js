import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseRoute, isValidRemoteUrl, runUpgrade } from '../src/engines.js';

test('local-only policy always blocks cloud providers', () => {
  const route = chooseRoute({
    privacyMode: 'local-only',
    cloudProvider: 'openai',
    hasOpenAIKey: true,
    hasOpenRouterKey: true,
    remoteEndpoint: 'https://example.com'
  });
  assert.equal(route.engine, 'deterministic');
  assert.equal(route.decision, 'policy-local-only');
});

test('route selection supports OpenAI and OpenRouter', () => {
  const openai = chooseRoute({ privacyMode: 'hybrid', cloudProvider: 'openai', hasOpenAIKey: true });
  assert.equal(openai.provider, 'openai');
  const openrouter = chooseRoute({ privacyMode: 'hybrid', cloudProvider: 'openrouter', hasOpenRouterKey: true });
  assert.equal(openrouter.provider, 'openrouter');
});

test('missing selected provider falls back to another configured provider', () => {
  const route = chooseRoute({
    privacyMode: 'hybrid',
    cloudProvider: 'openrouter',
    hasOpenRouterKey: false,
    hasOpenAIKey: true
  });
  assert.equal(route.provider, 'openai');
  assert.equal(route.decision, 'cloud-openai-fallback');
});

test('runUpgrade produces a valid deterministic clarity contract without keys', async () => {
  const output = await runUpgrade({
    draft: 'Build the best possible prompt enhancer that understands my real goal.',
    settings: { privacyMode: 'hybrid', cloudProvider: 'openai', maxClarifyingQuestions: 3 },
    context: { provider: 'chatgpt' }
  });
  assert.equal(output.engineUsed, 'deterministic-clarity');
  assert.ok(output.result.intent.primary_goal);
  assert.ok(output.result.compiled_prompt);
  assert.ok(output.result.interpretation.important_cues.length > 0);
});

test('provider failures fall back honestly to deterministic clarity', async () => {
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  const output = await runUpgrade({
    draft: 'Build a production-grade Chrome extension.',
    settings: { privacyMode: 'cloud-preferred', cloudProvider: 'openai', openaiApiKey: 'test', openaiModel: 'gpt-5.6-terra', maxClarifyingQuestions: 3 },
    context: { provider: 'chatgpt' }
  });
  assert.equal(output.engineUsed, 'deterministic-clarity-fallback');
  assert.match(output.fallbackReason, /network unavailable/i);
  assert.ok(output.result.compiled_prompt);
});

test('managed endpoint URL validation remains narrow', () => {
  assert.equal(isValidRemoteUrl(''), true);
  assert.equal(isValidRemoteUrl('https://example.com/clarify'), true);
  assert.equal(isValidRemoteUrl('http://localhost:3000/api'), true);
  assert.equal(isValidRemoteUrl('javascript:alert(1)'), false);
  assert.equal(isValidRemoteUrl('ftp://example.com'), false);
});
