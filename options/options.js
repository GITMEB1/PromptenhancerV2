import { DEFAULT_SETTINGS } from '../src/defaults.js';

const fields = {
  privacyMode: document.getElementById('privacyMode'),
  remoteEndpoint: document.getElementById('remoteEndpoint'),
  remoteApiKey: document.getElementById('remoteApiKey'),
  remoteModelLabel: document.getElementById('remoteModelLabel'),
  diagnosticsEnabled: document.getElementById('diagnosticsEnabled'),
  saveLocalHistory: document.getElementById('saveLocalHistory'),
  inlineButtonEnabled: document.getElementById('inlineButtonEnabled')
};

const statusEl = document.getElementById('status');

document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);

void loadSettings();

async function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS))) };
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') el.checked = Boolean(settings[key]);
    else el.value = settings[key] || '';
  }
}

async function saveSettings() {
  const next = {};
  for (const [key, el] of Object.entries(fields)) {
    next[key] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  await chrome.storage.sync.set(next);
  setStatus('Settings saved.');
}

async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await loadSettings();
  setStatus('Defaults restored.');
}

function setStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = '';
  }, 2500);
}
