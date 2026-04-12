import { heuristicUpgrade, scoreComplexity } from './heuristic-engine.js';
import { validateUpgradeResult } from './schema.js';

export async function runUpgrade({ draft, settings, context }) {
  const complexityScore = scoreComplexity(draft);
  const route = chooseRoute({
    privacyMode: settings.privacyMode,
    localAvailable: await hasBuiltInAi(),
    complexityScore,
    taskTypeHint: inferTaskTypeHint(draft),
    remoteEndpoint: settings.remoteEndpoint
  });

  let result;
  let engineUsed = route.engine;

  try {
    if (route.engine === 'local-ai') {
      result = await runBuiltInAiUpgrade(draft);
    } else if (route.engine === 'remote' && settings.remoteEndpoint) {
      result = await runRemoteUpgrade(draft, settings, context);
    } else {
      result = heuristicUpgrade(draft);
      engineUsed = 'heuristic';
    }
  } catch (error) {
    result = heuristicUpgrade(draft);
    engineUsed = 'heuristic-fallback';
  }

  const validation = validateUpgradeResult(result);
  if (!validation.ok) {
    result = heuristicUpgrade(draft);
    engineUsed = 'heuristic-repair';
  }

  return {
    route,
    engineUsed,
    complexityScore,
    result
  };
}

export function chooseRoute({ privacyMode, localAvailable, complexityScore, taskTypeHint, remoteEndpoint }) {
  if (privacyMode === 'local-only') {
    return { engine: localAvailable ? 'local-ai' : 'heuristic', reason: localAvailable ? 'Local-only mode with built-in AI available.' : 'Local-only mode without built-in AI; using heuristic fallback.' };
  }

  if (privacyMode === 'cloud-preferred' && remoteEndpoint) {
    return { engine: 'remote', reason: 'Cloud-preferred mode with remote endpoint configured.' };
  }

  if (taskTypeHint === 'research' || taskTypeHint === 'build') {
    if (complexityScore >= 2 && remoteEndpoint) {
      return { engine: 'remote', reason: 'Complex build/research task routed to remote endpoint.' };
    }
  }

  if (localAvailable) {
    return { engine: 'local-ai', reason: 'Built-in AI available for fast local upgrade.' };
  }

  if (remoteEndpoint) {
    return { engine: 'remote', reason: 'No local AI detected; using remote endpoint.' };
  }

  return { engine: 'heuristic', reason: 'No AI route available; using heuristic fallback.' };
}

async function hasBuiltInAi() {
  return typeof self !== 'undefined' && (
    'LanguageModel' in self ||
    'Prompt' in self ||
    'Rewriter' in self
  );
}

function inferTaskTypeHint(draft) {
  if (/\b(research|latest|sources|citations)\b/i.test(draft)) return 'research';
  if (/\b(build|app|extension|implement|architecture|repo|code)\b/i.test(draft)) return 'build';
  if (/\b(plan|roadmap|outline|strategy)\b/i.test(draft)) return 'plan';
  if (/\b(edit|rewrite|improve)\b/i.test(draft)) return 'edit';
  return 'write';
}

async function runBuiltInAiUpgrade(draft) {
  // Honest behaviour: try built-in APIs if present, otherwise throw.
  // The extension uses heuristic fallback whenever these APIs are unavailable.
  if ('Rewriter' in self) {
    const availability = await self.Rewriter.availability();
    if (availability === 'unavailable') throw new Error('Rewriter unavailable');
    const rewriter = await self.Rewriter.create({ tone: 'more-formal', length: 'medium' });
    const rewritten = await rewriter.rewrite(draft);
    return heuristicUpgrade(rewritten);
  }

  if ('LanguageModel' in self) {
    const availability = await self.LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }] });
    if (availability === 'unavailable') throw new Error('LanguageModel unavailable');
    const session = await self.LanguageModel.create({ expectedInputs: [{ type: 'text', languages: ['en'] }] });
    const prompt = [
      'Rewrite the following rough prompt into a clearer, stronger version while preserving intent.',
      '',
      draft
    ].join('\n');
    const rewritten = await session.prompt(prompt);
    return heuristicUpgrade(rewritten);
  }

  throw new Error('No built-in AI API available');
}

async function runRemoteUpgrade(draft, settings, context) {
  const response = await fetch(settings.remoteEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.remoteApiKey ? { 'Authorization': `Bearer ${settings.remoteApiKey}` } : {})
    },
    body: JSON.stringify({
      draft,
      context,
      response_schema: 'prompt_upgrader_v1'
    })
  });

  if (!response.ok) {
    throw new Error(`Remote endpoint failed: ${response.status}`);
  }

  return await response.json();
}
