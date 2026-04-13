const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const core = require('../src/provider-core.js');

function installRectShim(window) {
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      const spec = this.getAttribute('data-test-rect') || '0x0';
      const [widthRaw, heightRaw] = spec.split('x');
      const width = Number(widthRaw) || 0;
      const height = Number(heightRaw) || 0;
      return {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON() { return this; }
      };
    }
  });
}

function loadAdapters(window) {
  global.window = window;
  global.document = window.document;
  global.location = window.location;
  global.HTMLElement = window.HTMLElement;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  global.getComputedStyle = window.getComputedStyle.bind(window);
  global.PromptEnhancerProviderCore = core;

  const adapterPath = require.resolve('../src/provider-adapters.js');
  delete require.cache[adapterPath];
  require(adapterPath);

  return global.PromptEnhancerProviderAdapters;
}

function loadFixture(name, url) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const dom = new JSDOM(html, { url });
  installRectShim(dom.window);
  return dom;
}

test('ChatGPT adapter picks prompt textarea and ignores decoys', () => {
  const dom = loadFixture('chatgpt-compose.html', 'https://chatgpt.com/');
  const adapters = loadAdapters(dom.window);

  const adapter = adapters.getAdapter(dom.window.location.hostname);
  const target = adapter.findEditableTarget(dom.window.document);

  assert.equal(target?.id, 'prompt-textarea');
  assert.notEqual(target?.id, 'search-decoy');
});

test('Gemini adapter picks rich-textarea editor and ignores generic textarea decoy', () => {
  const dom = loadFixture('gemini-compose.html', 'https://gemini.google.com/');
  const adapters = loadAdapters(dom.window);

  const adapter = adapters.getAdapter(dom.window.location.hostname);
  const target = adapter.findEditableTarget(dom.window.document);

  assert.equal(target?.id, 'gemini-editor');
  assert.notEqual(target?.id, 'notes-decoy');
});

test('Candidate collection surfaces decoys but ranking still selects the right target', () => {
  const dom = loadFixture('gemini-compose.html', 'https://gemini.google.com/');
  const adapters = loadAdapters(dom.window);

  const candidates = adapters.collectCandidates(dom.window.document, core.PROVIDER_NAMES.GEMINI);
  const ids = candidates.map((candidate) => candidate.element.id).filter(Boolean);

  assert.ok(ids.includes('notes-decoy'));
  assert.ok(ids.includes('gemini-editor'));

  const best = core.chooseBestCandidate(candidates);
  assert.equal(best?.element?.id, 'gemini-editor');
});
