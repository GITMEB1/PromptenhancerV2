export function validateUpgradeResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'Result is not an object.' };
  const taskTypes = new Set(['explain', 'research', 'write', 'edit', 'build', 'plan']);
  if (!taskTypes.has(result.task_type)) return { ok: false, error: 'Invalid task_type.' };
  if (!isNonEmptyString(result.improved_prompt)) return { ok: false, error: 'Missing improved_prompt.' };
  if (!isStringArray(result.assumptions)) return { ok: false, error: 'Invalid assumptions.' };
  if (!isStringArray(result.missing_constraints)) return { ok: false, error: 'Invalid missing_constraints.' };
  if (!isStringArray(result.clarifying_questions)) return { ok: false, error: 'Invalid clarifying_questions.' };
  if (!result.variants || typeof result.variants !== 'object') return { ok: false, error: 'Missing variants.' };
  if (!isNonEmptyString(result.variants.concise)) return { ok: false, error: 'Missing concise variant.' };
  if (!isNonEmptyString(result.variants.rigorous)) return { ok: false, error: 'Missing rigorous variant.' };
  if (!isNonEmptyString(result.variants.agent_spec)) return { ok: false, error: 'Missing agent_spec variant.' };
  if (!isStringArray(result.safety_notes)) return { ok: false, error: 'Invalid safety_notes.' };
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    return { ok: false, error: 'Invalid confidence.' };
  }
  return { ok: true };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
