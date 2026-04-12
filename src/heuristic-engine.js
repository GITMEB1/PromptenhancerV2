import { EMPTY_RESULT } from './defaults.js';

const TASK_PATTERNS = [
  ['research', /\b(research|sources|citations|latest|compare|deep research|investigate)\b/i],
  ['build', /\b(build|create|implement|prototype|app|extension|architecture|system|code|repo)\b/i],
  ['edit', /\b(edit|rewrite|improve this text|refine this|fix wording|tighten)\b/i],
  ['write', /\b(write|draft|compose|email|message|post|copy)\b/i],
  ['plan', /\b(plan|roadmap|steps|strategy|outline|milestones)\b/i],
  ['explain', /\b(explain|teach|summarise|what is|how does)\b/i]
];

export function heuristicUpgrade(draft) {
  const clean = normalizeWhitespace(draft);
  const taskType = inferTaskType(clean);
  const missingConstraints = inferMissingConstraints(clean, taskType);
  const assumptions = inferAssumptions(clean, taskType);
  const improvedPrompt = buildImprovedPrompt(clean, taskType, missingConstraints);

  return {
    ...EMPTY_RESULT,
    task_type: taskType,
    improved_prompt: improvedPrompt,
    assumptions,
    missing_constraints: missingConstraints,
    clarifying_questions: buildClarifyingQuestions(missingConstraints),
    variants: {
      concise: buildConciseVariant(clean, taskType),
      rigorous: buildRigorousVariant(clean, taskType, missingConstraints),
      agent_spec: buildAgentSpecVariant(clean, taskType, missingConstraints)
    },
    safety_notes: buildSafetyNotes(clean),
    confidence: 0.48
  };
}

export function scoreComplexity(draft) {
  let score = 0;
  if (draft.length > 600) score += 2;
  if (draft.length > 1500) score += 2;
  if (/\b(build|architecture|system|design|research|evaluate|policy|security|roadmap)\b/i.test(draft)) score += 2;
  if ((draft.match(/\n/g) || []).length > 6) score += 1;
  if (/\b(step by step|multiple|compare|tradeoff|constraints|acceptance criteria)\b/i.test(draft)) score += 2;
  return score;
}

function inferTaskType(clean) {
  for (const [task, pattern] of TASK_PATTERNS) {
    if (pattern.test(clean)) return task;
  }
  return 'write';
}

function inferMissingConstraints(clean, taskType) {
  const missing = [];
  if (!/\bfor\b.+\b(audience|beginner|expert|child|team|client|developer|founder)\b/i.test(clean)) {
    missing.push('Target audience or reader');
  }
  if (!/\b(format|table|bullets|json|markdown|email|steps|spec|plan)\b/i.test(clean)) {
    missing.push('Preferred output format');
  }
  if (!/\b(short|brief|concise|detailed|deep|thorough)\b/i.test(clean)) {
    missing.push('Desired depth or length');
  }
  if (taskType === 'research' && !/\b(cite|source|official|recent|latest)\b/i.test(clean)) {
    missing.push('Source quality and freshness requirements');
  }
  if (taskType === 'build' && !/\b(stack|react|typescript|python|chrome extension|node|vercel|api)\b/i.test(clean)) {
    missing.push('Preferred tech stack or implementation constraints');
  }
  return missing.slice(0, 5);
}

function inferAssumptions(clean, taskType) {
  const assumptions = [];
  if (/\bchatgpt|gemini|claude|llm|prompt\b/i.test(clean)) {
    assumptions.push('The user wants a prompt that works well with modern LLMs.');
  }
  if (taskType === 'build') {
    assumptions.push('The user wants something practical and implementation-oriented.');
  }
  if (clean.length < 180) {
    assumptions.push('The original draft is likely intentionally rough and needs stronger structure.');
  }
  return assumptions.slice(0, 4);
}

function buildImprovedPrompt(clean, taskType, missingConstraints) {
  const intro = {
    explain: 'Explain the following clearly and accurately.',
    research: 'Research the following thoroughly and produce a reliable answer.',
    write: 'Write the following in a clear, effective way.',
    edit: 'Rewrite and improve the following while preserving intent.',
    build: 'Act as a senior product-minded engineer and produce a practical implementation-ready response.',
    plan: 'Create a concrete, well-structured plan for the following.'
  }[taskType];

  const outputHints = [];
  if (taskType === 'research') outputHints.push('Use trustworthy sources and separate facts from assumptions.');
  if (taskType === 'build') outputHints.push('Return concrete architecture, implementation details, and tradeoffs.');
  if (taskType === 'edit' || taskType === 'write') outputHints.push('Keep the language direct and useful rather than overly polished.');
  if (missingConstraints.length) outputHints.push(`Where the request is underspecified, surface the gaps explicitly instead of inventing them.`);

  return [
    intro,
    '',
    'User request:',
    clean,
    '',
    'Requirements:',
    ...outputHints.map((hint) => `- ${hint}`),
    '- Make the response structured and easy to act on.',
    '- Preserve the original goal and avoid adding fake assumptions.'
  ].join('\n');
}

function buildConciseVariant(clean, taskType) {
  return [
    `Task type: ${taskType}.`,
    'Improve this request into a clear, concise prompt that is ready to send.',
    '',
    clean
  ].join('\n');
}

function buildRigorousVariant(clean, taskType, missingConstraints) {
  const additions = missingConstraints.length
    ? `If important constraints are missing, list them explicitly before making limited assumptions.`
    : 'Minimise unnecessary assumptions.';
  return [
    `Treat this as a ${taskType} task.`,
    'Transform the draft into a high-quality prompt with clear scope, structured output expectations, and strong reasoning discipline.',
    additions,
    'Do not change the core objective.',
    '',
    clean
  ].join('\n');
}

function buildAgentSpecVariant(clean, taskType, missingConstraints) {
  return [
    `Objective: ${clean}`,
    `Task type: ${taskType}`,
    'Instructions:',
    '- Preserve the underlying intent.',
    '- Produce a structured, actionable result.',
    '- Surface missing constraints instead of inventing them.',
    ...(missingConstraints.length ? [`- Potential missing constraints: ${missingConstraints.join('; ')}`] : []),
    'Deliverables:',
    '- Primary answer',
    '- Assumptions',
    '- Risks or gaps',
    '- Recommended next step'
  ].join('\n');
}

function buildClarifyingQuestions(missingConstraints) {
  return missingConstraints.map((item) => `What should be specified for: ${item}?`).slice(0, 3);
}

function buildSafetyNotes(clean) {
  const notes = [];
  if (/\bmedical|legal|finance|financial|diagnosis|court\b/i.test(clean)) {
    notes.push('This request may benefit from stronger accuracy and source requirements.');
  }
  if (/\bcurrent|latest|today|recent\b/i.test(clean)) {
    notes.push('This request may require fresh information rather than static knowledge.');
  }
  return notes;
}

function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
