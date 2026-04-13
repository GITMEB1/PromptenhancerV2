let lastKnownTarget = null;
let inlineButtonHost = null;
let inlineButtonShadow = null;
let inlineButton = null;
let upgradeInFlight = false;

const providerAdapter = globalThis.PromptEnhancerProviderAdapters.getAdapter(location.hostname);
const providerCore = globalThis.PromptEnhancerProviderCore;

// --- Inline debounce (content scripts cannot use ES module imports) ---

function debounce(fn, delayMs) {
  let timerId = null;
  function debounced(...args) {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delayMs);
  }
  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
  return debounced;
}

// --- Message handling ---

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

// --- Init ---

init();

async function init() {
  const debouncedUpdate = debounce(() => {
    lastKnownTarget = detectEditableTarget();
    updateInlineButton();
  }, 50);

  const debouncedMutationUpdate = debounce(() => {
    updateInlineButton();
  }, 100);

  document.addEventListener('focusin', debouncedUpdate, true);
  document.addEventListener('click', debouncedUpdate, true);

  const { inlineButtonEnabled = true } = await chrome.storage.sync.get(['inlineButtonEnabled']);
  if (inlineButtonEnabled) {
    createInlineButton();
    updateInlineButton();
    const observer = new MutationObserver(debouncedMutationUpdate);
    observer.observe(document.documentElement, { subtree: true, childList: true });
  }
}

// --- Capture ---

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

// --- Write ---

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

// --- Target detection ---

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

// --- Write helpers ---

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

// --- Inline button (Shadow DOM isolated) ---

function createInlineButton() {
  if (inlineButtonHost) return;

  // Host element is a neutral container
  inlineButtonHost = document.createElement('prompt-upgrader-button');
  inlineButtonHost.style.position = 'fixed';
  inlineButtonHost.style.zIndex = '2147483647';
  inlineButtonHost.style.display = 'none';
  inlineButtonHost.style.pointerEvents = 'none';
  inlineButtonHost.style.top = '0';
  inlineButtonHost.style.left = '0';
  inlineButtonHost.style.width = '0';
  inlineButtonHost.style.height = '0';
  inlineButtonHost.style.overflow = 'visible';

  // Shadow DOM prevents host page CSS from affecting button
  inlineButtonShadow = inlineButtonHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    button {
      all: initial;
      position: absolute;
      display: block;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: linear-gradient(180deg, #1e293b, #111827);
      color: #e2e8f0;
      font-size: 11px;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.1);
      pointer-events: auto;
      transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      white-space: nowrap;
      line-height: 1;
    }
    button:hover {
      background: linear-gradient(180deg, #334155, #1e293b);
      box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.25);
      transform: translateY(-1px);
    }
    button:active {
      transform: translateY(0);
    }
    button.processing {
      opacity: 0.6;
      cursor: wait;
      pointer-events: none;
    }
  `;

  inlineButton = document.createElement('button');
  inlineButton.textContent = '⚡ Upgrade';
  inlineButton.setAttribute('type', 'button');

  inlineButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (upgradeInFlight) return;
    upgradeInFlight = true;
    inlineButton.classList.add('processing');
    inlineButton.textContent = 'Upgrading…';
    try {
      await chrome.runtime.sendMessage({ type: 'PAGE_TRIGGER_UPGRADE' }).catch(() => null);
    } finally {
      upgradeInFlight = false;
      inlineButton.classList.remove('processing');
      inlineButton.textContent = '⚡ Upgrade';
    }
  });

  inlineButtonShadow.appendChild(style);
  inlineButtonShadow.appendChild(inlineButton);
  document.documentElement.appendChild(inlineButtonHost);
}

function updateInlineButton() {
  if (!inlineButtonHost) return;

  const target = detectEditableTarget();
  if (!target) {
    inlineButtonHost.style.display = 'none';
    return;
  }

  // Only show when the field has content to upgrade
  const text = readFromTarget(target).trim();
  if (!text) {
    inlineButtonHost.style.display = 'none';
    return;
  }

  lastKnownTarget = target;

  // Verify target is still in the DOM
  if (!document.contains(target)) {
    inlineButtonHost.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;

  // Don't show if target is offscreen
  if (rect.bottom < 0 || rect.top > vpHeight || rect.right < 0 || rect.left > vpWidth) {
    inlineButtonHost.style.display = 'none';
    return;
  }

  // Position button at top-right of target, clamped within viewport
  const btnWidth = 90; // approximate button width
  const btnHeight = 28;
  const margin = 8;

  let top = rect.top + margin;
  let left = rect.right - btnWidth - margin;

  // Clamp within viewport
  top = Math.max(4, Math.min(top, vpHeight - btnHeight - 4));
  left = Math.max(4, Math.min(left, vpWidth - btnWidth - 4));

  inlineButtonHost.style.display = 'block';
  inlineButton.style.top = `${top}px`;
  inlineButton.style.left = `${left}px`;
}
