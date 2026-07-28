export const VALID_TASK_TYPES = new Set(['explain','research','write','edit','build','plan','analyse','decide']);

export function validateUpgradeResult(result) {
  const errors = collectSchemaErrors(result);
  return errors.length ? { ok: false, error: errors[0] } : { ok: true };
}

export function collectSchemaErrors(result) {
  const errors = [];
  if (!result || typeof result !== 'object') return ['Result is not an object.'];
  if (!VALID_TASK_TYPES.has(result.task_type)) errors.push('Invalid task_type.');
  if (!isNonEmptyString(result.compiled_prompt || result.improved_prompt)) errors.push('Missing compiled_prompt.');
  if (!result.intent || typeof result.intent !== 'object') {
    errors.push('Missing intent.');
  } else {
    if (!isNonEmptyString(result.intent.primary_goal)) errors.push('Missing intent.primary_goal.');
    if (!isNonEmptyString(result.intent.desired_outcome)) errors.push('Missing intent.desired_outcome.');
    if (!isNonEmptyString(result.intent.quality_bar)) errors.push('Missing intent.quality_bar.');
    for (const key of ['success_criteria','hard_constraints','soft_preferences','non_goals']) {
      if (!isStringArray(result.intent[key])) errors.push(`Invalid intent.${key}.`);
    }
  }
  if (!result.interpretation || !isNonEmptyString(result.interpretation.summary)) errors.push('Missing interpretation.summary.');
  if (!Array.isArray(result.ambiguities)) errors.push('Invalid ambiguities.');
  if (!Array.isArray(result.assumptions)) errors.push('Invalid assumptions.');
  if (!isNonEmptyString(result.clarified_brief)) errors.push('Missing clarified_brief.');
  if (!result.variants || typeof result.variants !== 'object') errors.push('Missing variants.');
  else {
    if (!isNonEmptyString(result.variants.concise)) errors.push('Missing concise variant.');
    if (!isNonEmptyString(result.variants.deep || result.variants.rigorous)) errors.push('Missing deep variant.');
    if (!isNonEmptyString(result.variants.implementation_spec || result.variants.agent_spec)) errors.push('Missing implementation_spec variant.');
  }
  return errors;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
