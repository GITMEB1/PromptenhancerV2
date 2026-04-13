export const VALID_TASK_TYPES = new Set(['explain', 'research', 'write', 'edit', 'build', 'plan']);

export function validateUpgradeResult(result) {
  const errors = collectSchemaErrors(result);
  if (errors.length > 0) return { ok: false, error: errors[0] };
  return { ok: true };
}

export function collectSchemaErrors(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return ['Result is not an object.'];
  }
  if (!VALID_TASK_TYPES.has(result.task_type)) errors.push('Invalid task_type.');
  if (!isNonEmptyString(result.improved_prompt)) errors.push('Missing improved_prompt.');
  if (!isStringArray(result.assumptions)) errors.push('Invalid assumptions.');
  if (!isStringArray(result.missing_constraints)) errors.push('Invalid missing_constraints.');
  if (!isStringArray(result.clarifying_questions)) errors.push('Invalid clarifying_questions.');
  if (!result.variants || typeof result.variants !== 'object') {
    errors.push('Missing variants.');
  } else {
    if (!isNonEmptyString(result.variants.concise)) errors.push('Missing concise variant.');
    if (!isNonEmptyString(result.variants.rigorous)) errors.push('Missing rigorous variant.');
    if (!isNonEmptyString(result.variants.agent_spec)) errors.push('Missing agent_spec variant.');
  }
  if (!isStringArray(result.safety_notes)) errors.push('Invalid safety_notes.');
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    errors.push('Invalid confidence.');
  }
  return errors;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

