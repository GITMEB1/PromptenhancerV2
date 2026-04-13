import { DEFAULT_SETTINGS } from './defaults.js';
import { runUpgrade } from './engines.js';

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined) next[key] = value;
  }
  if (Object.keys(next).length) {
    await chrome.storage.sync.set(next);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await triggerUpgradeForTab(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'upgrade-prompt') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  await triggerUpgradeForTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  if (message?.type === 'PAGE_TRIGGER_UPGRADE') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No sender tab found.' });
      return;
    }
    await triggerUpgradeForTab(tabId);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === 'GET_LATEST_RESULT') {
    const session = await chrome.storage.session.get(['latestUpgrade']);
    sendResponse({ ok: true, payload: session.latestUpgrade || null });
    return;
  }

  if (message?.type === 'APPLY_VARIANT') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      sendResponse({ ok: false, error: 'No active tab found.' });
      return;
    }

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'WRITE_PROMPT',
      text: message.text
    }).catch((error) => ({ ok: false, error: error.message }));

    sendResponse(result);
    return;
  }

  if (message?.type === 'COPY_TO_CLIPBOARD') {
    await chrome.storage.session.set({ clipboardFallbackText: message.text });
    sendResponse({ ok: true });
  }
}

async function triggerUpgradeForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) };
  const provider = inferProvider(tab.url || '');

  await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/sidepanel.html', enabled: true });

  const capture = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PROMPT' }).catch((error) => ({ ok: false, error: error.message }));

  if (!capture?.ok) {
    await chrome.storage.session.set({
      latestUpgrade: {
        status: 'error',
        error: capture?.error || 'Could not read the current prompt.',
        timestamp: Date.now(),
        provider
      }
    });
    await chrome.sidePanel.open({ tabId });
    return;
  }

  // Emit processing state so side panel shows immediate feedback
  await chrome.storage.session.set({
    latestUpgrade: {
      status: 'processing',
      sourceDraft: capture.text,
      provider,
      timestamp: Date.now()
    }
  });
  await chrome.sidePanel.open({ tabId });

  const upgrade = await runUpgrade({
    draft: capture.text,
    settings,
    context: {
      provider,
      url: tab.url || '',
      title: tab.title || ''
    }
  });

  const payload = {
    status: 'ready',
    provider,
    sourceDraft: capture.text,
    captureMeta: capture.meta,
    remoteModelLabel: settings.remoteModelLabel || '',
    ...upgrade,
    timestamp: Date.now()
  };

  await chrome.storage.session.set({ latestUpgrade: payload });
}

function inferProvider(url) {
  if (/chatgpt\.com|chat\.openai\.com/i.test(url)) return 'chatgpt';
  if (/gemini\.google\.com/i.test(url)) return 'gemini';
  return 'generic';
}
