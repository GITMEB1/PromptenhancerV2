(function initProviderAdapters(globalScope) {
  const core = globalScope.PromptEnhancerProviderCore;

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getKind(element) {
    if (element instanceof HTMLTextAreaElement) return 'textarea';
    if (element instanceof HTMLInputElement) return 'input';
    return 'contenteditable';
  }

  function isEditable(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    if (element instanceof HTMLInputElement) return element.type === 'text' && !element.disabled && !element.readOnly;
    return element.isContentEditable;
  }

  function hasPromptHints(element) {
    const text = [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('data-placeholder')
    ].filter(Boolean).join(' ').toLowerCase();

    return /(message|prompt|ask|chat|gemini)/.test(text);
  }

  function hasProviderAffinity(element, provider) {
    const html = element.outerHTML?.slice(0, 2000).toLowerCase() || '';
    if (provider === core.PROVIDER_NAMES.CHATGPT) {
      return html.includes('prompt-textarea') || html.includes('data-id="root"');
    }

    if (provider === core.PROVIDER_NAMES.GEMINI) {
      return html.includes('rich-textarea') || html.includes('modelresponse') || html.includes('bard');
    }

    return false;
  }

  function buildCandidate(element, provider, activeElement) {
    const rect = element.getBoundingClientRect();
    return {
      element,
      isEditable: isEditable(element),
      isVisible: isVisible(element),
      isActive: element === activeElement,
      withinForm: Boolean(element.closest('form')),
      hasPromptHints: hasPromptHints(element),
      providerAffinity: hasProviderAffinity(element, provider),
      kind: getKind(element),
      area: rect.width * rect.height
    };
  }

  function collectCandidates(documentRef, provider) {
    const activeElement = documentRef.activeElement;
    const selectors = core.getProviderSelectorPlan(provider);
    const deduped = new Set();
    const candidates = [];

    for (const selector of selectors) {
      for (const node of documentRef.querySelectorAll(selector)) {
        if (deduped.has(node)) continue;
        deduped.add(node);
        candidates.push(buildCandidate(node, provider, activeElement));
      }
    }

    return candidates;
  }

  function findEditableTarget(documentRef, provider) {
    const candidates = collectCandidates(documentRef, provider);
    const best = core.chooseBestCandidate(candidates);
    return best?.element || null;
  }

  function getAdapter(hostname) {
    const provider = core.inferProviderFromHostname(hostname || location.hostname);

    return {
      provider,
      findEditableTarget(documentRef = document) {
        return findEditableTarget(documentRef, provider);
      }
    };
  }

  globalScope.PromptEnhancerProviderAdapters = {
    getAdapter,
    isEditable,
    isVisible,
    getKind
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
