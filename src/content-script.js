const PROVIDERS = {
  chatgpt: {
    matches: () => /chatgpt\.com|chat\.openai\.com/i.test(location.hostname),
    selectors: [
      'textarea',
      '[contenteditable="true"]'
    ]
  },
  gemini: {
    matches: () => /gemini\.google\.com/i.test(location.hostname),
    selectors: [
      '[contenteditable="true"]',
      'textarea'
    ]
  },
  generic: {
    matches: () => true,
    selectors: [
      'textarea',
      '[contenteditable="true"]',
      'input[type="text"]'
    ]
  }
};

let lastKnownTarget = null;
let inlineButton = null;

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
      provider: inferProvider(),
      path: getElementPath(target)
    }
  };
}

async function writePrompt(text) {
  const target = detectEditableTarget() || lastKnownTarget;
  if (!target) {
    return { ok: false, error: 'No editable prompt field is available for replacement.' };
  }

  focusElement(target);
  const kind = getKind(target);
  let method = 'unknown';

  try {
    if (kind === 'textarea' || target instanceof HTMLInputElement) {
      method = 'native-value';
      setNativeValue(target, text);
      dispatchInputEvents(target);
    } else {
      method = 'contenteditable';
      replaceContentEditable(target, text);
      dispatchInputEvents(target);
    }

    const verified = readFromTarget(target).trim() === text.trim();
    if (!verified) {
      await copyToClipboard(text);
      return {
        ok: false,
        fallbackUsed: true,
        method: 'clipboard-fallback',
        error: 'Direct replacement failed. Copied upgraded prompt to clipboard instead.'
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
  const active = document.activeElement;
  if (isEditable(active)) return active;

  if (active?.closest) {
    const closestEditable = active.closest('[contenteditable="true"], textarea, input[type="text"]');
    if (isEditable(closestEditable)) return closestEditable;
  }

  const provider = getProviderConfig();
  for (const selector of provider.selectors) {
    const candidates = Array.from(document.querySelectorAll(selector));
    const visible = candidates.find((node) => isEditable(node) && isVisible(node));
    if (visible) return visible;
  }

  return null;
}

function getProviderConfig() {
  if (PROVIDERS.chatgpt.matches()) return PROVIDERS.chatgpt;
  if (PROVIDERS.gemini.matches()) return PROVIDERS.gemini;
  return PROVIDERS.generic;
}

function isEditable(element) {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (!isVisible(element)) return false;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement) return element.type === 'text' && !element.disabled && !element.readOnly;
  return element.isContentEditable;
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
}

function readFromTarget(target) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.value || '';
  return target.innerText || target.textContent || '';
}

function getKind(target) {
  if (target instanceof HTMLTextAreaElement) return 'textarea';
  if (target instanceof HTMLInputElement) return 'input';
  return 'contenteditable';
}

function focusElement(target) {
  target.focus();
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function replaceContentEditable(element, text) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('insertText', false, text);
  if (readFromTarget(element).trim() !== text.trim()) {
    element.textContent = text;
  }
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: null }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
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

function inferProvider() {
  if (PROVIDERS.chatgpt.matches()) return 'chatgpt';
  if (PROVIDERS.gemini.matches()) return 'gemini';
  return 'generic';
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
