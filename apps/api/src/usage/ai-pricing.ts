import type { ClaudeUsage } from '../gemini/claude.client';

/**
 * أسعار Claude (دولار لكل مليون توكن، أسعار Anthropic المباشرة). OpenRouter
 * بيرجّع التكلفة الفعلية مع كل رد، فما بنحتاج جدول إله.
 *
 * التخزين المؤقت: القراءة ‎0.1× سعر الإدخال، والكتابة (TTL ‏5 دقائق) ‎1.25×.
 */
const CLAUDE_PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: 'claude-fable-5', input: 10, output: 50 },
  { prefix: 'claude-mythos-5', input: 10, output: 50 },
  { prefix: 'claude-opus-5-5', input: 4, output: 20 },
  { prefix: 'claude-opus-5', input: 5, output: 25 },
  { prefix: 'claude-opus-4', input: 5, output: 25 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10 },
  { prefix: 'claude-sonnet-4', input: 3, output: 15 },
  { prefix: 'claude-haiku-4', input: 1, output: 5 },
];

/** 0 لنموذج مش معروف — أحسن من رقم مخترع؛ بيبيّن بالصفحة كـ $0 */
export function claudeCostUsd(model: string, usage: ClaudeUsage): number {
  // الأطول أولاً حتى claude-opus-5-5 ما يطابق claude-opus-5
  const price = [...CLAUDE_PRICES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((p) => model.startsWith(p.prefix));
  if (!price) return 0;
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    usage.input_tokens * perToken(price.input) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(price.input) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * perToken(price.input) * 0.1 +
    usage.output_tokens * perToken(price.output)
  );
}

/** النماذج المجانية على OpenRouter بتنتهي بـ :free (أو الموجّه openrouter/free) */
export function isFreeModel(model: string): boolean {
  return model.endsWith(':free') || model === 'openrouter/free';
}
