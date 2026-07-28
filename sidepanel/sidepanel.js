const state = { latest: null, activeVariant: 'default', diagnosticsEnabled: false };

const byId = id => document.getElementById(id);
const els = {
  statusBadge: byId('statusBadge'), providerPill: byId('providerPill'), statusText: byId('statusText'),
  processingSection: byId('processingSection'), processingDraftText: byId('processingDraftText'), resultSection: byId('resultSection'),
  primaryGoalText: byId('primaryGoalText'), interpretationText: byId('interpretationText'), desiredOutcomeText: byId('desiredOutcomeText'), qualityBarText: byId('qualityBarText'),
  questionsSection: byId('questionsSection'), questionFields: byId('questionFields'), refineBtn: byId('refineBtn'),
  resultText: byId('resultText'), originalDraftText: byId('originalDraftText'), assumptionsList: byId('assumptionsList'), cuesList: byId('cuesList'),
  taskTypeValue: byId('taskTypeValue'), engineUsedValue: byId('engineUsedValue'), routeDecisionRow: byId('routeDecisionRow'), routeDecisionValue: byId('routeDecisionValue'),
  modelLabelRow: byId('modelLabelRow'), modelLabelValue: byId('modelLabelValue'), confidenceValue: byId('confidenceValue'),
  replaceBtn: byId('replaceBtn'), copyBtn: byId('copyBtn'), openOptions: byId('openOptions'),
  tabs: Array.from(document.querySelectorAll('.tab')), fallbackNotice: byId('fallbackNotice'), fallbackReasonText: byId('fallbackReasonText'), schemaErrorsList: byId('schemaErrorsList')
};

void init();

async function init() {
  const settings = await chrome.storage.sync.get(['diagnosticsEnabled']);
  state.diagnosticsEnabled = Boolean(settings.diagnosticsEnabled);
  const response = await chrome.runtime.sendMessage({ type: 'GET_LATEST_RESULT' });
  if (response?.ok) { state.latest = response.payload; render(); }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.latestUpgrade) { state.latest = changes.latestUpgrade.newValue; render(); }
    if (area === 'sync' && changes.diagnosticsEnabled) { state.diagnosticsEnabled = Boolean(changes.diagnosticsEnabled.newValue); render(); }
  });

  els.tabs.forEach(tab => tab.addEventListener('click', () => {
    els.tabs.forEach(item => item.classList.remove('active'));
    tab.classList.add('active');
    state.activeVariant = tab.dataset.variant;
    renderText();
  }));

  els.copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getActiveText()); showCopyFeedback(); }
    catch { els.statusText.textContent = 'Copy failed. Select the text manually.'; }
  });

  els.replaceBtn.addEventListener('click', async () => {
    els.replaceBtn.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: 'APPLY_VARIANT', text: getActiveText() });
    els.replaceBtn.disabled = false;
    els.statusText.textContent = response?.ok ? 'Replaced the rough request in the page.' : (response?.error || 'Could not replace the page draft.');
  });

  els.refineBtn.addEventListener('click', refineWithAnswers);
  els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function render() {
  const latest = state.latest;
  if (!latest) return showIdle();
  if (latest.status === 'processing') return showProcessing(latest);
  if (latest.status === 'error') return showError(latest);

  setBadge('ready', 'Ready');
  setStatus(latest.provider || 'Unknown', latest.route?.reason || 'Clarity contract ready.');
  els.processingSection.classList.add('hidden');
  els.resultSection.classList.remove('hidden');

  const result = latest.result || {};
  const intent = result.intent || {};
  els.primaryGoalText.textContent = intent.primary_goal || 'Goal not extracted';
  els.interpretationText.textContent = result.interpretation?.summary || '';
  els.desiredOutcomeText.textContent = intent.desired_outcome || '—';
  els.qualityBarText.textContent = intent.quality_bar || '—';
  els.originalDraftText.textContent = latest.sourceDraft || '';
  els.taskTypeValue.textContent = result.task_type || '—';
  els.engineUsedValue.textContent = latest.engineUsed || '—';
  els.confidenceValue.textContent = result.clarity_confidence?.level || confidenceFromNumber(result.confidence);

  renderList(els.assumptionsList, result.assumptions, item => typeof item === 'string' ? item : `${item.assumption}${item.reason ? ` — ${item.reason}` : ''}`);
  renderList(els.cuesList, result.interpretation?.important_cues, item => `${item.phrase}: ${item.meaning}`);
  renderQuestions(result.ambiguities || []);
  renderDiagnostics(latest);
  renderText();
}

function showIdle() {
  setBadge('idle', 'Idle');
  setStatus('No page', 'Write a rough request, then trigger the clarity engine.');
  els.processingSection.classList.add('hidden');
  els.resultSection.classList.add('hidden');
}

function showProcessing(latest) {
  setBadge('processing', 'Processing');
  setStatus(latest.provider || 'Unknown', 'Extracting the real goal and material uncertainties…');
  els.processingSection.classList.remove('hidden');
  els.processingDraftText.textContent = latest.sourceDraft || '';
  els.resultSection.classList.add('hidden');
}

function showError(latest) {
  setBadge('error', 'Error');
  setStatus(latest.provider || 'Unknown', latest.error || 'Unknown error');
  els.processingSection.classList.add('hidden');
  els.resultSection.classList.add('hidden');
}

function renderQuestions(ambiguities) {
  const askable = ambiguities.filter(item => item.resolution === 'ask' && item.question);
  els.questionFields.innerHTML = '';
  els.questionsSection.classList.toggle('hidden', askable.length === 0);
  askable.forEach((item, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'question-block';
    const label = document.createElement('label');
    label.textContent = item.question;
    const why = document.createElement('p');
    why.className = 'eyebrow';
    why.textContent = item.why_it_matters || '';
    const textarea = document.createElement('textarea');
    textarea.className = 'answer-text';
    textarea.dataset.question = item.question;
    textarea.placeholder = 'Optional answer';
    textarea.rows = 3;
    wrapper.append(label, why, textarea);
    els.questionFields.appendChild(wrapper);
  });
}

async function refineWithAnswers() {
  const answers = Array.from(els.questionFields.querySelectorAll('textarea'))
    .map(el => ({ question: el.dataset.question, answer: el.value.trim() }))
    .filter(item => item.answer);
  if (!answers.length) { els.statusText.textContent = 'Add at least one answer before recompiling.'; return; }
  els.refineBtn.disabled = true;
  els.refineBtn.textContent = 'Recompiling…';
  const response = await chrome.runtime.sendMessage({ type: 'RECOMPILE_WITH_ANSWERS', answers });
  els.refineBtn.disabled = false;
  els.refineBtn.textContent = 'Recompile with answers';
  if (!response?.ok) els.statusText.textContent = response?.error || 'Could not recompile.';
}

function getActiveText() {
  const result = state.latest?.result || {};
  if (state.activeVariant === 'concise') return result.variants?.concise || result.compiled_prompt || result.improved_prompt || '';
  if (state.activeVariant === 'rigorous') return result.variants?.deep || result.variants?.rigorous || result.compiled_prompt || result.improved_prompt || '';
  if (state.activeVariant === 'agent_spec') return result.variants?.implementation_spec || result.variants?.agent_spec || result.compiled_prompt || result.improved_prompt || '';
  return result.compiled_prompt || result.improved_prompt || '';
}

function renderText() { els.resultText.value = getActiveText(); }

function renderList(element, items = [], format = item => String(item)) {
  element.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li'); li.textContent = 'None highlighted.'; element.appendChild(li); return;
  }
  items.forEach(item => { const li = document.createElement('li'); li.textContent = format(item); element.appendChild(li); });
}

function renderDiagnostics(latest) {
  if (state.diagnosticsEnabled && latest.route?.decision) {
    els.routeDecisionRow.classList.remove('hidden');
    els.routeDecisionValue.textContent = latest.route.decision;
  } else els.routeDecisionRow.classList.add('hidden');

  if (latest.remoteModelLabel) {
    els.modelLabelRow.classList.remove('hidden');
    els.modelLabelValue.textContent = latest.remoteModelLabel;
  } else els.modelLabelRow.classList.add('hidden');

  const errors = latest.schemaErrors || [];
  if (!latest.fallbackReason && !errors.length) { els.fallbackNotice.classList.add('hidden'); return; }
  els.fallbackNotice.classList.remove('hidden');
  els.fallbackReasonText.textContent = latest.fallbackReason || '';
  renderList(els.schemaErrorsList, errors);
  els.schemaErrorsList.classList.toggle('hidden', errors.length === 0);
}

function setBadge(kind, text) { els.statusBadge.className = `badge badge-${kind}`; els.statusBadge.textContent = text; }
function setStatus(provider, text) { els.providerPill.textContent = provider; els.statusText.textContent = text; }
function confidenceFromNumber(value) { return value >= .75 ? 'high' : value >= .5 ? 'medium' : 'low'; }
function showCopyFeedback() {
  const original = els.copyBtn.textContent;
  els.copyBtn.textContent = 'Copied ✓';
  setTimeout(() => { els.copyBtn.textContent = original; }, 1500);
}
