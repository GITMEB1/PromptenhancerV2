const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inferProviderFromHostname,
  getProviderSelectorPlan,
  verifyWritebackText,
  chooseBestCandidate,
  PROVIDER_NAMES
} = require('../src/provider-core.js');

test('inferProviderFromHostname recognizes supported providers', () => {
  assert.equal(inferProviderFromHostname('chatgpt.com'), PROVIDER_NAMES.CHATGPT);
  assert.equal(inferProviderFromHostname('chat.openai.com'), PROVIDER_NAMES.CHATGPT);
  assert.equal(inferProviderFromHostname('gemini.google.com'), PROVIDER_NAMES.GEMINI);
  assert.equal(inferProviderFromHostname('example.com'), PROVIDER_NAMES.GENERIC);
});

test('provider selector plans stay narrow and provider-specific', () => {
  const chatgptPlan = getProviderSelectorPlan(PROVIDER_NAMES.CHATGPT);
  const geminiPlan = getProviderSelectorPlan(PROVIDER_NAMES.GEMINI);

  assert.ok(chatgptPlan.includes('form textarea'));
  assert.ok(geminiPlan.includes('rich-textarea [contenteditable="true"]'));
  assert.ok(!geminiPlan.includes('input[type="text"]'));
});

test('verifyWritebackText normalizes equivalent whitespace', () => {
  assert.equal(verifyWritebackText('Hello   world', 'Hello world'), true);
  assert.equal(verifyWritebackText('Line one\nLine two', 'Line one\nLine two'), true);
  assert.equal(verifyWritebackText('Line one\nLine two', 'Line one Line two'), false);
});

test('chooseBestCandidate prefers active prompt-like textareas', () => {
  const winner = chooseBestCandidate([
    {
      id: 'input-field',
      isEditable: true,
      isVisible: true,
      isActive: false,
      withinForm: false,
      hasPromptHints: false,
      providerAffinity: false,
      kind: 'input',
      area: 2500
    },
    {
      id: 'chat-box',
      isEditable: true,
      isVisible: true,
      isActive: true,
      withinForm: true,
      hasPromptHints: true,
      providerAffinity: true,
      kind: 'textarea',
      area: 30000
    }
  ]);

  assert.equal(winner.id, 'chat-box');
});
