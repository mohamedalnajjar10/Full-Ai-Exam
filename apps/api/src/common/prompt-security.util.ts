/**
 * Prompt Security & Anti-Injection Utilities
 * Protects LLM prompts and guardrails against jailbreaks, prompt injection,
 * and system instruction exfiltration.
 */

const DANGEROUS_TAG_PATTERNS = [
  /<\/?student_question>/gi,
  /<\/?student_message>/gi,
  /<\/?system>/gi,
  /<\/?instructions>/gi,
  /<\/?prompt>/gi,
  /<\/?context>/gi,
  /<\/?user_query>/gi,
  /<\/?assistant>/gi,
];

/**
 * Strips dangerous XML/boundary tag injection attempts and zero-width/invisible control characters
 * from user inputs prior to LLM interpolation.
 */
export function sanitizePromptInput(input: string): string {
  if (!input) return '';

  let sanitized = input;

  // Remove invisible/zero-width formatting often used to evade keyword filters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Strip boundary tags
  for (const pattern of DANGEROUS_TAG_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}

/**
 * Sanitizes topic strings used in prompt builders.
 * Limits length to prevent buffer/context stuffing and strips newlines, quotes, and control characters.
 */
export function sanitizeTopicInput(topic?: string | null): string {
  if (!topic) return 'General curriculum topics for this subject';

  const cleaned = topic
    .replace(/["`\\]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

  return cleaned || 'General curriculum topics for this subject';
}
