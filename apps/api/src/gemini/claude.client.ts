import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude عبر Anthropic API مباشرة. بيقرا PDF أصلياً (عربي، معادلات، جداول)
 * وبياخد صفحات كتير بالطلب الواحد، فهو الخيار الموثوق لقراءة الكتب
 * والامتحانات بدل النماذج المجانية المحدودة يومياً.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

export type ClaudeEffort = 'low' | 'medium' | 'high';

/** نفس صيغة Gemini يلي بيبنيها كل مستدعٍ بـ GeminiService */
interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** بيحوّل محتوى بصيغة Gemini لرسائل Claude: الصور image، والـ PDF document */
export function toClaudeMessages(
  contents: string | GeminiContent[],
): Anthropic.Beta.BetaMessageParam[] {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }
  return contents.map((c) => {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = c.parts.map((p) => {
      if (p.inlineData) {
        const { mimeType, data } = p.inlineData;
        if (mimeType === 'application/pdf') {
          return {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          };
        }
        if ((IMAGE_TYPES as readonly string[]).includes(mimeType)) {
          return {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as ImageType, data },
          };
        }
        throw new Error(`Claude cannot read files of type ${mimeType}`);
      }
      return { type: 'text', text: p.text ?? '' };
    });
    return { role: c.role === 'model' ? 'assistant' : 'user', content: blocks };
  });
}

/**
 * مخططات JSON بالمشروع مكتوبة لـ Gemini. المخرجات المنظّمة بـ Claude بتطلب
 * additionalProperties: false على كل object — منضيفها بدون ما نغيّر الباقي.
 */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    out[k] = strictSchema(v);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

export function supportsServerFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5)/.test(model);
}

/** نفس شكل usage بالـ SDK — بالحقول يلي بتدخل بحساب التكلفة */
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export class ClaudeRefusalError extends Error {
  constructor(explanation?: string | null) {
    super(
      `Claude declined this request${explanation ? `: ${explanation}` : ''}`,
    );
    this.name = 'ClaudeRefusalError';
  }
}

export class ClaudeClient {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_CLAUDE_MODEL,
    /**
     * مفتاح على مستوى المنظمة (مش تابع لـ workspace) بيطلب هالـ header
     * بكل طلب، وإلا Anthropic بترجع 400
     */
    workspaceId?: string,
  ) {
    this.client = new Anthropic({
      apiKey,
      ...(workspaceId && {
        defaultHeaders: { 'anthropic-workspace-id': workspaceId },
      }),
    });
  }

  /**
   * طلب واحد، والرد نص (أو JSON لما في schema). streaming لأن تفريغ صفحات
   * كتاب بيطلع نص طويل، والطلبات الطويلة بدون stream بتوصل لمهلة الـ HTTP.
   */
  async generate(params: {
    contents: string | GeminiContent[];
    schema?: object;
    effort: ClaudeEffort;
    maxTokens?: number;
    timeoutMs: number;
    /** عدّاد التوكنات للرد (حتى لو رفض) — لسجل الاستهلاك والتكلفة */
    onUsage?: (usage: ClaudeUsage) => void;
  }): Promise<string> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: params.maxTokens ?? 32_000,
        messages: toClaudeMessages(params.contents),
        thinking: { type: 'adaptive' },
        output_config: {
          effort: params.effort,
          ...(params.schema && {
            format: {
              type: 'json_schema',
              schema: strictSchema(params.schema) as Record<string, unknown>,
            },
          }),
        },
        // لو مصنّف الأمان رفض طلب (نادر بمحتوى مدرسي)، السيرفر بيعيده على
        // نموذج بديل بنفس الطلب بدل ما يفشل. موثّق لعائلتي Opus 5 و Fable 5.
        ...(supportsServerFallbacks(this.model) && {
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default' as const,
        }),
      },
      { timeout: params.timeoutMs },
    );
    const message = await stream.finalMessage();
    params.onUsage?.(message.usage);

    if (message.stop_reason === 'refusal') {
      throw new ClaudeRefusalError(message.stop_details?.explanation);
    }
    return message.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
  }
}

/** أخطاء مؤقتة يستاهل معها نجرّب المزوّد التاني (الـ SDK بيعيد مرتين قبلها) */
export function isTransientClaudeError(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError ||
    (err instanceof Anthropic.APIError && err.status === 529)
  );
}
