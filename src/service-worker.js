import { DEFAULT_SETTINGS } from './defaults.js';
import { runUpgrade } from './engines.js';

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[key] === undefined && !key.endsWith('ApiKey')) next[key] = value;
  }
  if (Object.keys(next).length) await chrome.storage.sync.set(next);
});

chrome.action.onClicked.addListener(async tab => {
  if (tab.id) await triggerUpgradeForTab(tab.id);
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'upgrade-prompt') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id) await triggerUpgradeForTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  if (message?.type === 'PAGE_TRIGGER_UPGRADE') {
    const tabId = sender.tab?.id;
    if (!tabId) return sendResponse({ ok: false, error: 'No sender tab found.' });
    await triggerUpgradeForTab(tabId);
    return sendResponse({ ok: true });
  }

  if (message?.type === 'GET_LATEST_RESULT') {
    const session = await chrome.storage.session.get(['latestUpgrade']);
    return sendResponse({ ok: true, payload: session.latestUpgrade || null });
  }

  if (message?.type === 'APPLY_VARIANT') {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return sendResponse({ ok: false, error: 'No active tab found.' });
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'WRITE_PROMPT',
      text: message.text
    }).catch(error => ({ ok: false, error: error.message }));
    return sendResponse(result);
  }

  if (message?.type === 'RECOMPILE_WITH_ANSWERS') {
    const session = await chrome.storage.session.get(['latestUpgrade']);
    const previous = session.latestUpgrade;
    if (!previous?.sourceDraft) return sendResponse({ ok: false, error: 'No active clarity result to refine.' });
    const settings = await loadSettings();
    const answers = Array.isArray(message.answers) ? message.answers.filter(item => item?.answer?.trim()) : [];
    const answerContext = answers.map(item => `Question: ${item.question}\nAnswer: ${item.answer}`).join('\n\n');
    const refinedDraft = `${previous.sourceDraft}\n\nUser clarification answers:\n${answerContext}`;
    const upgrade = await runUpgrade({
      draft: refinedDraft,
      settings,
      context: { provider: previous.provider, refinement: true }
    });
    const payload = {
      ...previous,
      status: 'ready',
      refinementAnswers: answers,
      ...upgrade,
      timestamp: Date.now()
    };
    await chrome.storage.session.set({ latestUpgrade: payload });
    return sendResponse({ ok: true });
  }
}

async function triggerUpgradeForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const settings = await loadSettings();
  const provider = inferProvider(tab.url || '');

  await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/sidepanel.html', enabled: true });
  const capture = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_PROMPT' }).catch(error => ({ ok: false, error: error.message }));

  if (!capture?.ok) {
    await chrome.storage.session.set({
      latestUpgrade: { status: 'error', error: capture?.error || 'Could not read the current prompt.', timestamp: Date.now(), provider }
    });
    await chrome.sidePanel.open({ tabId });
    return;
  }

  await chrome.storage.session.set({
    latestUpgrade: { status: 'processing', sourceDraft: capture.text, provider, timestamp: Date.now() }
  });
  await chrome.sidePanel.open({ tabId });

  const upgrade = await runUpgrade({
    draft: capture.text,
    settings,
    context: { provider, url: tab.url || '', title: tab.title || '' }
  });

  const payload = {
    status: 'ready',
    provider,
    sourceDraft: capture.text,
    captureMeta: capture.meta,
    remoteModelLabel: activeModelLabel(settings, upgrade.route),
    ...upgrade,
    timestamp: Date.now()
  };

  await chrome.storage.session.set({ latestUpgrade: payload });
  if (settings.saveLocalHistory) await saveHistoryEntry(payload);
}

async function loadSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(null),
    chrome.storage.local.get(['openaiApiKey', 'openrouterApiKey', 'remoteApiKey'])
  ]);
  return { ...DEFAULT_SETTINGS, ...synced, ...local };
}

async function saveHistoryEntry(payload) {
  const stored = await chrome.storage.local.get(['clarityHistory']);
  const history = Array.isArray(stored.clarityHistory) ? stored.clarityHistory : [];
  const result = payload.result;
  history.unshift({
    id: crypto.randomUUID(),
    timestamp: payload.timestamp,
    provider: payload.provider,
    sourceDraft: payload.sourceDraft,
    primaryGoal: result.intent?.primary_goal || '',
    compiledPrompt: result.compiled_prompt || result.improved_prompt,
    engineUsed: payload.engineUsed
  });
  await chrome.storage.local.set({ clarityHistory: history.slice(0, 100) });
}

function activeModelLabel(settings, route) {
  if (route?.provider === 'openai') return settings.openaiModel;
  if (route?.provider === 'openrouter') return settings.openrouterModel;
  return settings.remoteModelLabel || '';
}

function inferProvider(url) {
  if (/chatgpt\.com|chat\.openai\.com/i.test(url)) return 'chatgpt';
  if (/gemini\.google\.com/i.test(url)) return 'gemini';
  return 'generic';
}
