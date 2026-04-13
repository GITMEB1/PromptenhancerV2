let lastKnownTarget = null;
let inlineButton = null;

const providerAdapter = globalThis.PromptEnhancerProviderAdapters.getAdapter(location.hostname);
const providerCore = globalThis.PromptEnhancerProviderCore;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CAPTURE_PROMPT') {
    const capture = capturePrompt();
    sendResponse(capture);
    return;
  }

  if (message?.type === 'WRITE_PROMPT') {
    void writePrompt(message.text).then(sendResponse);
    return true;
  }
});

init();

async function init() {
  document.addEventListener('focusin', () => {
    lastKnownTarget = detectEditableTarget();
    positionInlineButton();
  }, true);

  document.addEventListener('click', () => {
    lastKnownTarget = detectEditableTarget();
    positionInlineButton();
  }, true);

  const { inlineButtonEnabled = true } = await chrome.storage.sync.get(['inlineButtonEnabled']);
  if (inlineButtonEnabled) {
    createInlineButton();
    positionInlineButton();
    const observer = new MutationObserver(() => positionInlineButton());
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  }
}

function capturePrompt() {
  const target = detectEditableTarget();
  if (!target) {
    return { ok: false, error: 'No editable prompt field found on this page.' };
  }

  lastKnownTarget = target;
  const text = readFromTarget(target).trim();
  if (!text) {
    return { ok: false, error: 'The active prompt field is empty.' };
  }

  return {
    ok: true,
    text,
    meta: {
      kind: getKind(target),
      provider: providerAdapter.provider,
      path: getElementPath(target)
    }
  };
}

async function writePrompt(text) {
  const target = resolveWriteTarget();
  if (!target) {
    return { ok: false, error: 'No editable prompt field is available for replacement.' };
  }

  focusElement(target);
  const kind = getKind(target);
  let method = 'unknown';

  try {
    if (kind === 'textarea' || kind === 'input') {
      method = 'native-value';
      writeNativeText(target, text);
    } else {
      method = 'contenteditable';
      writeContentEditableText(target, text);
    }

    dispatchInputEvents(target);
    const verified = await verifyWriteback(target, text);
    if (!verified) {
      await copyToClipboard(text);
      return {
        ok: false,
        fallbackUsed: true,
        method: 'clipboard-fallback',
        error: 'Direct replacement failed verification. Copied upgraded prompt to clipboard instead.'
      };
    }

    return { ok: true, verified: true, method };
  } catch (error) {
    await copyToClipboard(text);
    return {
      ok: false,
      fallbackUsed: true,
      method: 'clipboard-fallback',
      error: error.message || 'Writeback failed. Copied to clipboard instead.'
    };
  }
}

function detectEditableTarget() {
  const target = providerAdapter.findEditableTarget(document);
  return target && isEditable(target) ? target : null;
}

function resolveWriteTarget() {
  const detected = detectEditableTarget();
  if (detected) return detected;
  if (lastKnownTarget && document.contains(lastKnownTarget) && isEditable(lastKnownTarget)) return lastKnownTarget;
  return null;
}

function readFromTarget(target) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.value || '';
  return target.innerText || target.textContent || '';
}

function getKind(target) {
  return globalThis.PromptEnhancerProviderAdapters.getKind(target);
}

function isEditable(target) {
  return globalThis.PromptEnhancerProviderAdapters.isEditable(target);
}

function focusElement(target) {
  target.focus();
}

function writeNativeText(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  if (typeof element.setSelectionRange === 'function') {
    const position = value.length;
    element.setSelectionRange(position, position);
  }
}

function writeContentEditableText(element, text) {
  const selection = window.getSelection();
  const range = document.createRange();

  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  const commandApplied = document.execCommand('insertText', false, text);
  if (!commandApplied || !providerCore.verifyWritebackText(readFromTarget(element), text)) {
    element.replaceChildren(document.createTextNode(text));
    moveCaretToEnd(element);
  }
}

function moveCaretToEnd(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText' }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: null }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function verifyWriteback(target, expectedText) {
  const attempts = 3;
  for (let index = 0; index < attempts; index += 1) {
    const actual = readFromTarget(target);
    if (providerCore.verifyWritebackText(actual, expectedText)) return true;
    await delay(20);
  }

  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

function getElementPath(element) {
  const parts = [];
  let current = element;
  while (current && current !== document.body && parts.length < 5) {
    const name = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    const classes = current.classList?.length ? `.${Array.from(current.classList).slice(0, 2).join('.')}` : '';
    parts.unshift(`${name}${id}${classes}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function createInlineButton() {
  if (inlineButton) return;
  inlineButton = document.createElement('button');
  inlineButton.textContent = 'Upgrade';
  inlineButton.setAttribute('type', 'button');
  inlineButton.style.position = 'fixed';
  inlineButton.style.zIndex = '2147483647';
  inlineButton.style.padding = '8px 10px';
  inlineButton.style.borderRadius = '10px';
  inlineButton.style.border = '1px solid rgba(255,255,255,0.15)';
  inlineButton.style.background = '#111827';
  inlineButton.style.color = '#fff';
  inlineButton.style.fontSize = '12px';
  inlineButton.style.fontFamily = 'system-ui, sans-serif';
  inlineButton.style.cursor = 'pointer';
  inlineButton.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
  inlineButton.style.display = 'none';
  inlineButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await chrome.runtime.sendMessage({ type: 'PAGE_TRIGGER_UPGRADE' }).catch(() => null);
  });
  document.documentElement.appendChild(inlineButton);
}

function positionInlineButton() {
  if (!inlineButton) return;
  const target = detectEditableTarget();
  if (!target) {
    inlineButton.style.display = 'none';
    return;
  }
  lastKnownTarget = target;
  const rect = target.getBoundingClientRect();
  inlineButton.style.display = 'block';
  inlineButton.style.top = `${Math.max(12, rect.top + 8)}px`;
  inlineButton.style.left = `${Math.max(12, rect.right - 78)}px`;
}
