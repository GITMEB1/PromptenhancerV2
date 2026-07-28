import { DEFAULT_SETTINGS } from '../src/defaults.js';
import { isValidRemoteUrl } from '../src/engines.js';

const secretKeys = new Set(['openaiApiKey', 'openrouterApiKey', 'remoteApiKey']);
const fields = Object.fromEntries([
  'privacyMode','cloudProvider','openaiModel','openaiApiKey','openrouterModel','openrouterApiKey',
  'remoteEndpoint','remoteApiKey','remoteModelLabel','reasoningEffort','clarificationPolicy',
  'maxClarifyingQuestions','remoteTimeoutMs','diagnosticsEnabled','saveLocalHistory','inlineButtonEnabled'
].map(id => [id, document.getElementById(id)]));

const statusEl = document.getElementById('status');
const providerSections = {
  openai: document.getElementById('openaiFields'),
  openrouter: document.getElementById('openrouterFields'),
  managed: document.getElementById('managedFields')
};

document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);
document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
fields.cloudProvider.addEventListener('change', renderProviderFields);
void loadSettings();

async function loadSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get(null),
    chrome.storage.local.get([...secretKeys])
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...synced, ...local };
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') el.checked = Boolean(settings[key]);
    else el.value = settings[key] ?? '';
  }
  renderProviderFields();
}

async function saveSettings() {
  if (!isValidRemoteUrl(fields.remoteEndpoint.value.trim())) {
    setStatus('Enter a valid managed endpoint URL or leave it blank.');
    return;
  }

  const synced = {};
  const local = {};
  for (const [key, el] of Object.entries(fields)) {
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = Number(el.value);
    else value = el.value.trim();

    if (key === 'maxClarifyingQuestions') value = Math.max(0, Math.min(5, value || 0));
    if (key === 'remoteTimeoutMs') value = Math.max(5000, Math.min(120000, value || DEFAULT_SETTINGS.remoteTimeoutMs));
    (secretKeys.has(key) ? local : synced)[key] = value;
  }

  await Promise.all([
    chrome.storage.sync.set(synced),
    chrome.storage.local.set(local)
  ]);
  setStatus('Settings saved.');
}

async function resetSettings() {
  const syncedDefaults = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([key]) => !secretKeys.has(key)));
  await Promise.all([
    chrome.storage.sync.set(syncedDefaults),
    chrome.storage.local.remove([...secretKeys])
  ]);
  await loadSettings();
  setStatus('Defaults restored and stored keys removed.');
}

async function clearHistory() {
  await chrome.storage.local.remove(['clarityHistory']);
  setStatus('Local clarity history cleared.');
}

function renderProviderFields() {
  const selected = fields.cloudProvider.value || 'openai';
  for (const [name, section] of Object.entries(providerSections)) {
    section.classList.toggle('hidden', name !== selected);
  }
}

function setStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = '';
  }, 3500);
}
