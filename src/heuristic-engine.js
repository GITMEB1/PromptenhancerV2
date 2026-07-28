import { EMPTY_RESULT } from './defaults.js';

const TASK_PATTERNS = [
  ['research', /\b(research|sources|citations|latest|compare|investigate)\b/i],
  ['build', /\b(build|rebuild|create|implement|prototype|app|extension|architecture|system|code|repo)\b/i],
  ['edit', /\b(edit|rewrite|improve this text|refine this|fix wording|tighten)\b/i],
  ['plan', /\b(plan|roadmap|steps|strategy|outline|milestones)\b/i],
  ['analyse', /\b(analyse|analyze|audit|evaluate|diagnose|assess)\b/i],
  ['decide', /\b(decide|choose|recommend|best option|trade-off|tradeoff)\b/i],
  ['explain', /\b(explain|teach|summarise|summarize|what is|how does)\b/i],
  ['write', /\b(write|draft|compose|email|message|post|copy)\b/i]
];

const AMBITION_PATTERNS = [
  ['master', 'Signals an exceptionally high bar for depth, precision, judgement and consistency.'],
  ['the fucking best', 'Signals rejection of a merely adequate result and a demand for maximum practical quality.'],
  ['best', 'Signals that alternatives and trade-offs should be considered rather than accepting the first workable answer.'],
  ['ultimate', 'Signals a broad, ambitious scope that should be converted into explicit success criteria.'],
  ['perfect', 'Signals a very high quality expectation, although perfection itself is not objectively measurable.'],
  ['production-grade', 'Signals reliability, security, maintainability, observability and realistic failure handling.'],
  ['professional', 'Signals polished execution appropriate for real users rather than a disposable demo.']
];

export function heuristicUpgrade(draft, options = {}) {
  const clean = normalizeWhitespace(draft);
  const taskType = inferTaskType(clean);
  const cues = inferImportantCues(clean);
  const missing = inferMissingConstraints(clean, taskType);
  const maxQuestions = Math.max(0, Math.min(5, Number(options.maxClarifyingQuestions) || 3));
  const ambiguities = buildAmbiguities(missing).slice(0, maxQuestions);
  const intent = buildIntent(clean, taskType, cues);
  const clarifiedBrief = buildClarifiedBrief(intent, clean);
  const compiledPrompt = buildCompiledPrompt(intent, clean, ambiguities);
  const assumptions = inferAssumptions(clean, taskType);
  const confidenceLevel = ambiguities.some(item => item.materiality === 'critical') ? 'low' : ambiguities.length ? 'medium' : 'high';

  return {
    ...EMPTY_RESULT,
    task_type: taskType,
    intent,
    interpretation: {
      summary: `The user wants ${intent.primary_goal.toLowerCase()} The expected outcome is ${intent.desired_outcome.toLowerCase()}`,
      important_cues: cues
    },
    ambiguities,
    assumptions,
    clarified_brief: clarifiedBrief,
    compiled_prompt: compiledPrompt,
    improved_prompt: compiledPrompt,
    missing_constraints: missing,
    clarifying_questions: ambiguities.filter(item => item.resolution === 'ask').map(item => item.question),
    variants: {
      concise: `Goal: ${intent.primary_goal}\n\n${clean}`,
      rigorous: compiledPrompt,
      agent_spec: buildAgentSpec(intent, clean, ambiguities),
      deep: compiledPrompt,
      implementation_spec: buildAgentSpec(intent, clean, ambiguities)
    },
    safety_notes: buildSafetyNotes(clean),
    confidence: confidenceLevel === 'high' ? 0.82 : confidenceLevel === 'medium' ? 0.62 : 0.4,
    clarity_confidence: {
      level: confidenceLevel,
      rationale: ambiguities.length ? 'Important details remain underspecified.' : 'The goal, outcome and constraints are reasonably explicit.'
    }
  };
}

export function scoreComplexity(draft) {
  let score = 0;
  if (draft.length > 500) score += 2;
  if (draft.length > 1400) score += 2;
  if (/\b(build|rebuild|architecture|system|research|evaluate|security|roadmap)\b/i.test(draft)) score += 2;
  if (/\b(openai|openrouter|api|provider|integration|acceptance criteria)\b/i.test(draft)) score += 1;
  if (inferImportantCues(draft).length) score += 1;
  return score;
}

function inferTaskType(clean) {
  for (const [task, pattern] of TASK_PATTERNS) if (pattern.test(clean)) return task;
  return 'write';
}

function inferImportantCues(clean) {
  const lower = clean.toLowerCase();
  return AMBITION_PATTERNS
    .filter(([phrase]) => lower.includes(phrase))
    .map(([phrase, meaning]) => ({ phrase, meaning, certainty: phrase === 'master' ? 'medium' : 'high' }))
    .slice(0, 5);
}

function buildIntent(clean, taskType, cues) {
  const quality = cues.length
    ? 'Maximum practical quality: deep goal fidelity, precise communication, useful questions, disciplined assumptions and implementation-grade output.'
    : 'Clear, useful and actionable rather than unnecessarily verbose.';
  return {
    primary_goal: sentence(`Complete the ${taskType} task described in the rough request while preserving the user's real intent`),
    desired_outcome: sentence('Produce a result the user can act on immediately, with hidden assumptions and material uncertainties made explicit'),
    user_context: sentence(clean.length < 220 ? 'The user is intentionally providing a rough or incomplete request and expects the system to infer carefully' : 'The user has supplied meaningful context that should be preserved and organised'),
    target_audience: /\b(user|customer|client|team|developer|child|beginner|expert)\b/i.test(clean) ? 'Use the audience stated in the request.' : 'Not explicitly stated.',
    quality_bar: quality,
    success_criteria: ['Preserve the underlying goal.', 'Expose important assumptions.', 'Ask only questions that could materially improve the result.', 'Return a model-ready prompt that is easy to act on.'],
    hard_constraints: inferExplicitConstraints(clean),
    soft_preferences: cues.map(item => item.meaning),
    non_goals: ['Do not inflate the prompt with generic role-play or repeated instructions.', 'Do not change the core objective.']
  };
}

function inferMissingConstraints(clean, taskType) {
  const missing = [];
  if (!/\b(audience|beginner|expert|customer|client|team|developer|child)\b/i.test(clean)) missing.push('Target audience or end user');
  if (!/\b(success|done|acceptance criteria|measure|outcome|conversion|working)\b/i.test(clean)) missing.push('Observable success criteria');
  if (!/\b(format|table|bullets|json|markdown|email|steps|spec|plan|code)\b/i.test(clean)) missing.push('Preferred deliverable format');
  if (taskType === 'build' && !/\b(chrome|web|mobile|react|typescript|javascript|python|node|backend|extension)\b/i.test(clean)) missing.push('Implementation platform or technical boundaries');
  if (!/\b(short|brief|concise|detailed|deep|thorough|maximum|best|master)\b/i.test(clean)) missing.push('Desired depth and quality bar');
  return missing.slice(0, 5);
}

function buildAmbiguities(missing) {
  return missing.map((topic, index) => ({
    topic,
    why_it_matters: `Different choices for ${topic.toLowerCase()} could materially change the recommended output.`,
    materiality: index < 2 ? 'important' : 'optional',
    resolution: index < 3 ? 'ask' : 'assume',
    question: questionFor(topic)
  }));
}

function questionFor(topic) {
  const questions = {
    'Target audience or end user': 'Who will use or judge the result, and what level of knowledge should be assumed?',
    'Observable success criteria': 'What would make you say the result has genuinely succeeded rather than merely looking good?',
    'Preferred deliverable format': 'What final format would be most immediately useful?',
    'Implementation platform or technical boundaries': 'Which platform, stack or implementation constraints are fixed?',
    'Desired depth and quality bar': 'How deep should the result go, and what does excellent mean in this context?'
  };
  return questions[topic] || `What should be specified for ${topic.toLowerCase()}?`;
}

function inferAssumptions(clean, taskType) {
  const assumptions = [];
  if (/\bchatgpt|gemini|claude|llm|prompt\b/i.test(clean)) assumptions.push({ assumption: 'The result should work well with modern language models.', reason: 'The request explicitly concerns prompts or LLM tooling.', risk: 'low' });
  if (taskType === 'build') assumptions.push({ assumption: 'The user wants an implementation-oriented result rather than a purely conceptual discussion.', reason: 'The request is framed as a build task.', risk: 'low' });
  if (clean.length < 180) assumptions.push({ assumption: 'The roughness of the request is intentional and should not be mistaken for a lack of ambition.', reason: 'The source prompt is short but directive.', risk: 'medium' });
  return assumptions;
}

function inferExplicitConstraints(clean) {
  const lines = clean.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.filter(line => /^[-*]|\b(must|cannot|only|budget|deadline|constraint)\b/i.test(line)).slice(0, 8);
}

function buildClarifiedBrief(intent, clean) {
  return [`Primary goal: ${intent.primary_goal}`, `Desired outcome: ${intent.desired_outcome}`, `Quality bar: ${intent.quality_bar}`, '', 'Source request:', clean].join('\n');
}

function buildCompiledPrompt(intent, clean, ambiguities) {
  return [
    `Goal: ${intent.primary_goal}`,
    '',
    `Desired outcome: ${intent.desired_outcome}`,
    '',
    `Quality bar: ${intent.quality_bar}`,
    '',
    'Original request:',
    clean,
    '',
    'Requirements:',
    ...intent.success_criteria.map(item => `- ${item}`),
    ...(intent.hard_constraints.length ? ['- Preserve these hard constraints:', ...intent.hard_constraints.map(item => `  - ${item}`)] : []),
    '- Separate facts, assumptions and recommendations where relevant.',
    '- Do not add generic filler or repeat instructions unnecessarily.',
    ...(ambiguities.length ? ['- Where unresolved ambiguity materially affects the result, state the limited assumption used.'] : [])
  ].join('\n');
}

function buildAgentSpec(intent, clean, ambiguities) {
  return [
    `OBJECTIVE\n${intent.primary_goal}`,
    `\nDESIRED OUTCOME\n${intent.desired_outcome}`,
    `\nQUALITY BAR\n${intent.quality_bar}`,
    `\nSOURCE REQUEST\n${clean}`,
    `\nSUCCESS CRITERIA\n${intent.success_criteria.map(item => `- ${item}`).join('\n')}`,
    ambiguities.length ? `\nUNRESOLVED QUESTIONS\n${ambiguities.map(item => `- ${item.question}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
}

function buildSafetyNotes(clean) {
  const notes = [];
  if (/\bmedical|legal|finance|financial|diagnosis|court\b/i.test(clean)) notes.push('This request may require stronger accuracy, professional-review and source requirements.');
  if (/\b(current|latest|today|recent|price|law|policy|model)\b/i.test(clean)) notes.push('This request may require fresh information rather than static knowledge.');
  return notes;
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function sentence(value) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
