import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
  BadGatewayException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  EmbeddingKind,
  LocalEmbedder,
} from './local-embedder';
import {
  ClaudeClient,
  ClaudeEffort,
  DEFAULT_CLAUDE_MODEL,
  isTransientClaudeError,
  type ClaudeUsage,
} from './claude.client';

/** نص الخطأ لسجل الاستهلاك — String() على كائن عادي بيطلع [object Object] */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}

/** usage بردّ OpenRouter (مع usage.include) — cost بالدولار */
interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}
import { JSON_LATEX_ESCAPING, parseModelJson } from '../common/content-format';
import { AiUsageService, type AiTask } from '../usage/ai-usage.service';
import { claudeCostUsd, isFreeModel } from '../usage/ai-pricing';
import { PrismaService } from '../prisma/prisma.service';

/** Dynamic AI task route configuration from AppSetting (table 'AppSetting', key 'ai_task_routes') */
export interface AiTaskRouteConfig {
  task: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/** Shape of a single question extracted by Gemini from a PDF */
export interface ExtractedQuestion {
  questionText: string;
  choices: { label: string; text: string }[];
  correctAnswer: string;
  explanation?: string;
}

/** Shape of a single AI-generated question (Sprint 3) */
export interface GeneratedQuestion {
  questionText: string;
  choices: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  bloomTaxonomy: string;
}

/** Style blueprint extracted from an uploaded student question sheet (Sprint 3) */
export interface StyleMatrix {
  averageQuestionLength: number; // avg word count per question
  latexDensity: 'LOW' | 'MEDIUM' | 'HIGH'; // fraction of questions using LaTeX
  distractorComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  cognitiveDepth: string; // e.g. "REMEMBER", "APPLY", "ANALYZE"
  questionStructureNotes: string; // free-text style observations
  sampleQuestions: string[]; // 2â€“3 verbatim samples for prompt injection
}

/**
 * JSON-schema constraint passed to Gemini so it returns valid structured output.
 * All mathematical/chemical formulas are normalized to LaTeX ($...$ inline, $$...$$ block).
 */
const EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    questions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          questionText: {
            type: 'string' as const,
            description:
              'The full question text. Normalize all mathematical and chemical formulas into valid LaTeX: use $...$ for inline math and $$...$$ for display/block math.',
          },
          choices: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                label: {
                  type: 'string' as const,
                  description: 'Choice label, e.g. "A", "B", "C", "D"',
                },
                text: {
                  type: 'string' as const,
                  description:
                    'Choice text. Normalize formulas into valid LaTeX.',
                },
              },
              required: ['label', 'text'],
            },
          },
          correctAnswer: {
            type: 'string' as const,
            description:
              'The label of the correct choice, e.g. "A", "B", "C", or "D"',
          },
          explanation: {
            type: 'string' as const,
            description:
              'Optional explanation of the correct answer. Normalize formulas into valid LaTeX.',
          },
          number: {
            type: 'integer' as const,
            description: 'The question number as printed in the document.',
          },
          confidence: {
            type: 'number' as const,
            description:
              'Your confidence from 0 to 1 that the text, choices and correct answer were read exactly right.',
          },
          suggestedDifficulty: {
            type: 'string' as const,
            enum: ['EASY', 'MEDIUM', 'HARD'],
          },
          suggestedBloom: {
            type: 'string' as const,
            enum: [
              'REMEMBER',
              'UNDERSTAND',
              'APPLY',
              'ANALYZE',
              'EVALUATE',
              'CREATE',
            ],
          },
          suggestedUnit: {
            type: 'string' as const,
            description: 'The curriculum unit this question belongs to.',
          },
          issues: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description:
              'Short Arabic notes on problems a reviewer must check (e.g. "الإجابة لا تطابق الشرح", "نص غير واضح"). Empty if none.',
          },
        },
        required: ['questionText', 'choices', 'correctAnswer'],
      },
    },
  },
  required: ['questions'],
};

/** خيارات استخراج الأسئلة من ملف امتحان (من إعدادات خط المعالجة) */
export interface ExtractionOptions {
  /** لغات النص بالملف: 'ara+eng' | 'ara' | 'eng' */
  ocrLang?: string;
  /** false = المعادلات بنص عادي بدل LaTeX */
  keepLatex?: boolean;
  subjectName?: string;
  /** وحدات المادة المعروفة، حتى النموذج يختار منها */
  units?: string[];
}

/** سؤال مستخرج مع تقييم النموذج — للمراجعة والاعتماد التلقائي */
export interface ExtractedQuestionWithMeta extends ExtractedQuestion {
  number?: number;
  confidence?: number;
  suggestedDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  suggestedBloom?: string;
  suggestedUnit?: string;
  issues?: string[];
}

const OCR_LANGUAGE_HINT: Record<string, string> = {
  'ara+eng': 'Arabic and English (the page may mix both)',
  ara: 'Arabic',
  eng: 'English',
};

/** معلومات نموذج التضمين الفعّال — للعرض بلوحة التحكم */
export interface EmbeddingInfo {
  enabled: boolean;
  provider: 'gemini' | 'openrouter' | 'local' | null;
  model: string | null;
  dimensions: number;
}

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

/** أقصى عدد نصوص بطلب تضمين واحد */
export const EMBEDDING_BATCH_SIZE = 32;

/**
 * بيقص المتجه للأبعاد المطلوبة ويرجّع طوله لـ 1. نماذج Matryoshka (مثل
 * gemini-embedding-001) بتسمح بالقص، بس المتجه المقصوص لازم يتطبّع
 * من جديد حتى يضل تشابه جيب التمام صحيح.
 */
export function fitDimensions(values: number[], dims: number): number[] {
  if (values.length < dims) {
    throw new Error(
      `Embedding model returned ${values.length} dimensions; EMBEDDING_DIMENSIONS is ${dims}`,
    );
  }
  if (values.length === dims) return values;
  const cut = values.slice(0, dims);
  const norm = Math.sqrt(cut.reduce((s, x) => s + x * x, 0)) || 1;
  return cut.map((x) => x / norm);
}

/** JSON schema for Sprint 3 AI-generated question output */
const GENERATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    questions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          questionText: {
            type: 'string' as const,
            description:
              'Full question text. Use $...$ for inline LaTeX and $$...$$ for display math.',
          },
          choices: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                label: { type: 'string' as const },
                text: {
                  type: 'string' as const,
                  description: 'Choice text with LaTeX-normalized formulas.',
                },
              },
              required: ['label', 'text'],
            },
            description: 'Exactly 4 answer choices labelled A, B, C, D.',
          },
          correctAnswer: {
            type: 'string' as const,
            description: 'Label of the correct choice: "A", "B", "C", or "D".',
          },
          explanation: {
            type: 'string' as const,
            description:
              'Concise explanation of why the correct answer is correct. LaTeX-normalized.',
          },
          bloomTaxonomy: {
            type: 'string' as const,
            enum: [
              'REMEMBER',
              'UNDERSTAND',
              'APPLY',
              'ANALYZE',
              'EVALUATE',
              'CREATE',
            ],
            description: "Bloom's Taxonomy level this question targets.",
          },
        },
        required: [
          'questionText',
          'choices',
          'correctAnswer',
          'explanation',
          'bloomTaxonomy',
        ],
      },
    },
  },
  required: ['questions'],
};

/** JSON schema for style matrix extraction */
const STYLE_MATRIX_SCHEMA = {
  type: 'object' as const,
  properties: {
    averageQuestionLength: {
      type: 'number' as const,
      description: 'Average word count per question in the document.',
    },
    latexDensity: {
      type: 'string' as const,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      description: 'Proportion of questions containing LaTeX math notation.',
    },
    distractorComplexity: {
      type: 'string' as const,
      enum: ['SIMPLE', 'MODERATE', 'COMPLEX'],
      description: 'Overall complexity level of wrong answer choices.',
    },
    cognitiveDepth: {
      type: 'string' as const,
      enum: [
        'REMEMBER',
        'UNDERSTAND',
        'APPLY',
        'ANALYZE',
        'EVALUATE',
        'CREATE',
      ],
      description: "Dominant Bloom's Taxonomy level in the document.",
    },
    questionStructureNotes: {
      type: 'string' as const,
      description:
        'Free-text observations about question phrasing style, tone, and structure.',
    },
    sampleQuestions: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '2â€“3 verbatim sample questions from the document.',
    },
  },
  required: [
    'averageQuestionLength',
    'latexDensity',
    'distractorComplexity',
    'cognitiveDepth',
    'questionStructureNotes',
    'sampleQuestions',
  ],
};

/** Per-attempt ceiling for a single model call. */
const AI_ATTEMPT_TIMEOUT_MS = 30_000;

/** Ceiling for the whole fallback chain, so several models cannot stack up. */
const AI_TOTAL_TIMEOUT_MS = 90_000;

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

class AiTimeoutError extends Error {
  constructor(model: string, ms: number) {
    super(`Model "${model}" timed out after ${ms}ms`);
    this.name = 'AiTimeoutError';
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  model: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiTimeoutError(model, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Gemini-style content, which every caller in this service still builds. */
interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

type OpenRouterPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

interface OpenRouterMessage {
  role: 'user' | 'assistant';
  content: string | OpenRouterPart[];
}

/**
 * يحوّل صيغة Gemini (role/parts/inlineData) لرسائل OpenRouter
 * (نفس صيغة OpenAI). الصور بتروح image_url، وملفات PDF بتروح file
 * وOpenRouter بيتكفّل بقراءتها حتى لو الموديل ما بيدعم PDF مباشرة.
 */
export function toOpenRouterMessages(
  contents: string | GeminiContent[],
): OpenRouterMessage[] {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }

  return contents.map((c) => {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts: OpenRouterPart[] = c.parts.map((p) => {
      if (p.inlineData) {
        const { mimeType, data } = p.inlineData;
        const url = `data:${mimeType};base64,${data}`;
        if (mimeType.startsWith('image/')) {
          return { type: 'image_url', image_url: { url } };
        }
        const ext = mimeType.split('/')[1] ?? 'bin';
        return {
          type: 'file',
          file: { filename: `document.${ext}`, file_data: url },
        };
      }
      return { type: 'text', text: p.text ?? '' };
    });

    // رسائل النص الصافي منبعتها كنص، بعض المزوّدين ما بيقبلوا مصفوفة للـ assistant
    const textOnly = parts.every((p) => p.type === 'text');
    return {
      role,
      content: textOnly
        ? parts.map((p) => (p as { text: string }).text).join('\n\n')
        : parts,
    };
  });
}

/**
 * بيقسم تفريغ النموذج لصفحات حسب فواصل «===== PAGE n =====». متسامح مع
 * يلي بتعمله النماذج فعلاً: فاصل بخط عريض (**...**) أو # قبله، كلمة «صفحة»
 * بدل PAGE، أو ترقيم نسبي 1..n بدل أرقام الكتاب. بدون فواصل أبداً، النص
 * كله بيروح للصفحة الأولى بدل ما يضيع.
 */
export function splitTranscribedPages(
  text: string,
  firstPage: number,
  pageCount: number,
): { page: number; text: string }[] {
  const last = firstPage + pageCount - 1;
  const re = /^[\s*#_>]*=*\s*(?:PAGE|الصفحة|صفحة)\s*(\d+)\s*=*[\s*_]*$/gim;
  const marks = [...text.matchAll(re)];
  if (marks.length === 0) {
    return text.trim() ? [{ page: firstPage, text: text.trim() }] : [];
  }
  const numbers = marks.map((m) => Number(m[1]));
  // النموذج رقّم 1..n بدل أرقام الكتاب
  const relative =
    firstPage > 1 &&
    numbers.every((n) => n < firstPage || n > last) &&
    numbers.every((n) => n >= 1 && n <= pageCount);
  const pages: { page: number; text: string }[] = [];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const page = relative ? numbers[i] + firstPage - 1 : numbers[i];
    if (page >= firstPage && page <= last) {
      pages.push({ page, text: text.slice(start, end).trim() });
    }
  });
  return pages;
}

/** Maps Gemini's responseMimeType/responseSchema onto OpenRouter's response_format. */
function toResponseFormat(config?: {
  responseMimeType?: string;
  responseSchema?: object;
}): object | undefined {
  if (config?.responseSchema) {
    return {
      type: 'json_schema',
      json_schema: { name: 'response', schema: config.responseSchema },
    };
  }
  if (config?.responseMimeType === 'application/json') {
    return { type: 'json_object' };
  }
  return undefined;
}

function stripJsonFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : text;
}

function splitModels(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * AI gateway for the app. Text, chat, extraction and question generation go
 * through OpenRouter; embeddings still use Gemini directly until RAG is set up.
 */
@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private ai: GoogleGenAI | null = null;
  private geminiModel: string = 'gemini-3.1-flash-lite';
  private openRouterKey: string;
  private parserModel: string;
  private generationModel: string;
  private fallbackModels: string[];
  private embeddingModel: string;
  private openRouterEmbeddingModel: string;
  /** Claude مباشرة — لما ANTHROPIC_API_KEY موجود بيصير المزوّد الأساسي */
  private claude: ClaudeClient | null = null;
  /** gemini | openrouter | local — فاضي = gemini إذا في مفتاح، وإلا local */
  private embeddingProvider: string;
  private localEmbedder: LocalEmbedder | null = null;
  private embeddingDimensions: number;
  private cachedTaskRoutes: Map<string, AiTaskRouteConfig> = new Map();
  private cachedRoutesExpiresAt = 0;
  private readonly ROUTES_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly config: ConfigService,
    // اختياري حتى الاختبارات تبني الخدمة بالإعدادات بس
    @Optional() private readonly usage?: AiUsageService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    if (this.prisma) {
      this.refreshTaskRoutesCache().catch((err) => {
        this.logger.warn(
          `Failed to preload AI task routes from AppSetting: ${String(err)}`,
        );
      });
    }
    this.openRouterKey = this.config.get<string>('OPENROUTER_API_KEY', '');
    this.parserModel = this.config.get<string>(
      'OPENROUTER_PARSER_MODEL',
      'google/gemini-2.5-flash',
    );
    this.generationModel = this.config.get<string>(
      'OPENROUTER_GENERATION_MODEL',
      'google/gemini-2.5-flash',
    );
    this.fallbackModels = splitModels(
      this.config.get<string>('OPENROUTER_FALLBACK_MODELS', ''),
    );
    this.embeddingModel = this.config.get<string>(
      'GEMINI_EMBEDDING_MODEL',
      'gemini-embedding-001',
    );
    this.openRouterEmbeddingModel = this.config.get<string>(
      'OPENROUTER_EMBEDDING_MODEL',
      'google/gemini-embedding-001',
    );
    this.embeddingProvider = this.config
      .get<string>('EMBEDDING_PROVIDER', '')
      .trim()
      .toLowerCase();
    this.embeddingDimensions = Number(
      this.config.get<number>('EMBEDDING_DIMENSIONS', 768),
    );

    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY', '');
    if (anthropicKey) {
      this.claude = new ClaudeClient(
        anthropicKey,
        this.config.get<string>('ANTHROPIC_MODEL', '') || DEFAULT_CLAUDE_MODEL,
        this.config.get<string>('ANTHROPIC_WORKSPACE_ID', '') || undefined,
      );
      this.logger.log(
        `Claude is the primary AI provider (${this.claude.model})${this.openRouterKey ? '; OpenRouter is the fallback' : ''}`,
      );
    } else if (!this.openRouterKey) {
      this.logger.warn(
        'Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set: chat, extraction and question generation are disabled.',
      );
    }

    const geminiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.geminiModel = this.config.get<string>(
      'GEMINI_MODEL',
      'gemini-3.1-flash-lite',
    );
    if (geminiKey) {
      this.ai = new GoogleGenAI({ apiKey: geminiKey });
      this.logger.log(
        `Google Gemini initialized as primary AI provider (${this.geminiModel})`,
      );
    } else {
      this.logger.warn(
        'GEMINI_API_KEY is not set: question generation, conversation and classification will use fallback provider (OpenRouter)',
      );
    }

    const emb = this.embeddingInfo();
    this.logger.log(
      `AI Fallback configured via OpenRouter (parser: ${this.parserModel}, generation: ${this.generationModel}` +
        `${this.fallbackModels.length ? `, fallbacks: ${this.fallbackModels.join(', ')}` : ''}); ` +
        `embeddings: ${emb.enabled ? `${emb.provider}:${emb.model} @ ${emb.dimensions}d` : 'disabled (no GEMINI_API_KEY or OPENROUTER_API_KEY)'}`,
    );
  }

  /** Claude مفعّل كمزوّد أساسي؟ */
  usesClaude(): boolean {
    return this.claude !== null;
  }

  /**
   * Retrieves dynamic AI task route configuration from AppSetting ('ai_task_routes').
   * Cached in memory with 60-second TTL for zero DB latency.
   */
  async getTaskRouteConfig(task?: string): Promise<AiTaskRouteConfig | null> {
    if (!task || !this.prisma) return null;
    const now = Date.now();
    if (now > this.cachedRoutesExpiresAt) {
      await this.refreshTaskRoutesCache();
    }
    return this.cachedTaskRoutes.get(task) ?? null;
  }

  private async refreshTaskRoutesCache(): Promise<void> {
    if (!this.prisma) return;
    try {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key: 'ai_task_routes' },
      });
      this.cachedTaskRoutes.clear();
      if (setting?.value && Array.isArray(setting.value)) {
        for (const r of setting.value as any[]) {
          if (r && typeof r === 'object' && r.task && r.model) {
            this.cachedTaskRoutes.set(r.task, {
              task: r.task,
              model: r.model,
              temperature:
                typeof r.temperature === 'number' ? r.temperature : undefined,
              maxTokens:
                typeof r.maxTokens === 'number' ? r.maxTokens : undefined,
            });
          }
        }
      }
      this.cachedRoutesExpiresAt = Date.now() + this.ROUTES_CACHE_TTL_MS;
    } catch {
      this.cachedRoutesExpiresAt = Date.now() + 10_000;
    }
  }

  /**
   * كم صفحة منبعت بطلب قراءة واحد. Claude بيقرا PDF أصلياً وبيتحمّل
   * دفعات أكبر بكتير (أسرع وأرخص لكل صفحة)؛ النماذج المجانية بتعلق فوق ٤.
   */
  documentPagesPerRequest(task: 'ocr' | 'exam'): number {
    if (this.claude) return task === 'ocr' ? 10 : 20;
    return task === 'ocr' ? 4 : 3;
  }

  /**
   * التضمين: Gemini مباشرة إذا GEMINI_API_KEY موجود، وإلا عبر OpenRouter
   * بنفس مفتاح المحادثة. الافتراضي بالحالتين gemini-embedding-001 بـ 768
   * بُعد، فالمتجهات المخزّنة بتضل متوافقة لو تبدّل المزوّد.
   */
  embeddingInfo(): EmbeddingInfo {
    const provider = this.embeddingProvider || (this.ai ? 'gemini' : 'local');
    if (provider === 'gemini' && this.ai) {
      return {
        enabled: true,
        provider: 'gemini',
        model: this.embeddingModel,
        dimensions: this.embeddingDimensions,
      };
    }
    if (provider === 'openrouter' && this.openRouterKey) {
      return {
        enabled: true,
        provider: 'openrouter',
        model: this.openRouterEmbeddingModel,
        dimensions: this.embeddingDimensions,
      };
    }
    if (provider === 'local') {
      // مجاني ومحلي: الافتراضي لما ما في مفتاح Gemini (Claude ما عنده تضمين)
      this.localEmbedder ??= new LocalEmbedder(
        this.config.get<string>('LOCAL_EMBEDDING_MODEL', '') ||
          DEFAULT_LOCAL_EMBEDDING_MODEL,
      );
      return {
        enabled: true,
        provider: 'local',
        model: this.localEmbedder.model,
        dimensions: this.localEmbedder.dimensions ?? this.embeddingDimensions,
      };
    }
    return {
      enabled: false,
      provider: null,
      model: null,
      dimensions: this.embeddingDimensions,
    };
  }

  /**
   * استدعاء خدمة Google Gemini الرسمية عبر مكتبة @google/genai (النموذج الأساسي).
   */
  private async callGemini(
    contents: any,
    config: any,
    signal?: AbortSignal,
    overrideModel?: string,
  ): Promise<{
    text?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }> {
    if (!this.ai) {
      throw new Error(
        'Google Gemini client is not initialized (missing GEMINI_API_KEY)',
      );
    }

    const geminiConfig: any = {};
    if (config?.responseMimeType) {
      geminiConfig.responseMimeType = config.responseMimeType;
    }
    if (config?.responseSchema) {
      geminiConfig.responseSchema = config.responseSchema;
    }
    if (config?.temperature !== undefined) {
      geminiConfig.temperature = config.temperature;
    }
    if (signal) {
      geminiConfig.abortSignal = signal;
    }

    const response = await this.ai.models.generateContent({
      model: overrideModel || this.geminiModel,
      contents,
      config: Object.keys(geminiConfig).length > 0 ? geminiConfig : undefined,
    });

    const text = response.text;
    const usageMetadata = (response as any)?.usageMetadata;
    return {
      text:
        config?.responseSchema ||
        config?.responseMimeType === 'application/json'
          ? text
            ? stripJsonFence(text)
            : text
          : text,
      usage: usageMetadata
        ? {
            prompt_tokens: usageMetadata.promptTokenCount,
            completion_tokens: usageMetadata.candidatesTokenCount,
          }
        : undefined,
    };
  }

  /** One chat-completions call to OpenRouter, returning Gemini's `{ text }` shape. */
  private async callOpenRouter(
    model: string,
    contents: any,
    config: any,
    signal: AbortSignal,
    overrideMaxTokens?: number,
  ): Promise<{ text?: string; usage?: OpenRouterUsage }> {
    let responseFormat = toResponseFormat(config);
    const isFree = isFreeModel(model);
    if (isFree && responseFormat && (responseFormat as any).type === 'json_schema') {
      responseFormat = { type: 'json_object' };
    }
    const configuredMaxTokens = Number(
      overrideMaxTokens ??
        this.config.get<number>('OPENROUTER_MAX_TOKENS', 16384),
    );
    // OpenRouter free models reject requests with max_tokens > 4096 with HTTP 402/400
    const maxTokens = isFree
      ? Math.min(configuredMaxTokens, 4096)
      : configuredMaxTokens;
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${this.openRouterKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Exam',
      },
      body: JSON.stringify({
        model,
        messages: toOpenRouterMessages(contents),
        max_tokens: maxTokens,
        usage: { include: true },
        ...(responseFormat && {
          response_format: responseFormat,
          ...(!isFree && { provider: { require_parameters: true } }),
        }),
      }),
    });

    const body: any = await res.json().catch(() => ({}));
    const error = body?.error ?? body?.choices?.[0]?.error;
    if (!res.ok || error) {
      const status = error?.code ?? res.status;
      throw new Error(
        `OpenRouter ${status}: ${error?.message ?? res.statusText ?? 'request failed'}`,
      );
    }

    const usage = (body as { usage?: OpenRouterUsage } | null)?.usage;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { text: undefined, usage };
    // بعض الموديلات بتلف الـ JSON بـ ```json حتى مع response_format
    return {
      text: responseFormat ? stripJsonFence(content) : content,
      usage,
    };
  }

  private recordClaude(
    task: AiTask,
    started: number,
    success: boolean,
    usage?: ClaudeUsage,
    err?: unknown,
  ) {
    const model = this.claude!.model;
    this.usage?.record({
      task,
      provider: 'anthropic',
      model,
      inputTokens:
        (usage?.input_tokens ?? 0) +
        (usage?.cache_creation_input_tokens ?? 0) +
        (usage?.cache_read_input_tokens ?? 0),
      outputTokens: usage?.output_tokens,
      costUsd: usage ? claudeCostUsd(model, usage) : 0,
      latencyMs: Date.now() - started,
      success,
      error: err === undefined ? undefined : errorText(err),
    });
  }

  /**
   * Resilient wrapper around a model call with automatic multi-model fallback.
   * If a model is rate-limited, overloaded, missing or times out, it fails
   * over to the next one: preferred → parser → generation → OPENROUTER_FALLBACK_MODELS.
   */
  async generateContentWithFallback(params: {
    preferredModel?: string;
    contents: any;
    config?: any;
    /** مهام طويلة (تفريغ صفحات كتاب) بتحتاج مهلة أطول من المحادثة */
    attemptTimeoutMs?: number;
    totalTimeoutMs?: number;
    /** جهد التفكير عند Claude: تفريغ نص = low، توليد أسئلة = high */
    effort?: ClaudeEffort;
    /** مهلة طلب Claude الواحد (بيقرا دفعات صفحات أكبر، فبياخد أطول) */
    claudeTimeoutMs?: number;
    /** نوع المهمة بسجل الاستهلاك */
    task?: AiTask;
  }): Promise<{ text?: string }> {

    const task = params.task ?? 'other';
    const taskRoute = await this.getTaskRouteConfig(task);
    const routeModel = taskRoute?.model;
    const preferredModel = params.preferredModel ?? routeModel;

    const requestConfig = {
      ...params.config,
      ...(taskRoute?.temperature !== undefined &&
      params.config?.temperature === undefined
        ? { temperature: taskRoute.temperature }
        : {}),
    };

    const defaultAttemptTimeout =
      Number(this.config.get<number>('AI_ATTEMPT_TIMEOUT_MS', 0)) ||
      (task === 'generation' ? 75_000 : AI_ATTEMPT_TIMEOUT_MS);
    const attemptTimeout = params.attemptTimeoutMs ?? defaultAttemptTimeout;
    const defaultTotalTimeout =
      Number(this.config.get<number>('AI_TOTAL_TIMEOUT_MS', 0)) ||
      (task === 'generation' ? 150_000 : AI_TOTAL_TIMEOUT_MS);
    const totalTimeout = params.totalTimeoutMs ?? defaultTotalTimeout;

    // الميزانية الشهرية خلصت والإيقاف الصارم مفعّل: النماذج المجانية بس
    const paidBlocked = (await this.usage?.paidModelsBlocked()) ?? false;

    const geminiTargetModel =
      routeModel && !routeModel.includes('/') ? routeModel : this.geminiModel;

    // 1. المزود الأساسي (Primary Provider): خدمة Google Gemini الرسمية عبر مكتبة @google/genai بنموذج gemini-2.5-flash
    if (
      this.ai &&
      typeof this.ai.models?.generateContent === 'function' &&
      !paidBlocked
    ) {
      const started = Date.now();
      const controller = new AbortController();
      try {
        const { text, usage } = await withTimeout(
          this.callGemini(params.contents, requestConfig, controller.signal, geminiTargetModel),
          attemptTimeout,
          geminiTargetModel,
        );
        this.usage?.record({
          task,
          provider: 'gemini',
          model: geminiTargetModel,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          latencyMs: Date.now() - started,
          success: true,
        });
        if (text !== undefined && text !== null) {
          return { text };
        }
      } catch (err: any) {
        controller.abort();
        const msg = err?.message ?? String(err);
        this.logger.warn(
          `Google Gemini (${geminiTargetModel}) primary call failed or timed out: ${msg.slice(0, 150)}. Switching to OpenRouter fallback...`,
        );
        this.usage?.record({
          task,
          provider: 'gemini',
          model: geminiTargetModel,
          latencyMs: Date.now() - started,
          success: false,
          error: errorText(err),
        });

        // إذا كان الخطأ 503 (ضغط على السيرفر) أو عارض، جرب النماذج البديلة التابعة لـ Gemini أولاً
        const isTransient =
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('spikes in demand');

        if (isTransient) {
          const geminiBackups = [
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
            'gemini-3.8-flash',
          ].filter((m) => m !== geminiTargetModel);

          for (const backupModel of geminiBackups) {
            const backupController = new AbortController();
            const backupStarted = Date.now();
            try {
              this.logger.log(
                `Failing over to backup Gemini model "${backupModel}" due to transient demand...`,
              );
              const { text, usage } = await withTimeout(
                this.callGemini(
                  params.contents,
                  requestConfig,
                  backupController.signal,
                  backupModel,
                ),
                attemptTimeout,
                backupModel,
              );
              this.usage?.record({
                task,
                provider: 'gemini',
                model: backupModel,
                inputTokens: usage?.prompt_tokens,
                outputTokens: usage?.completion_tokens,
                latencyMs: Date.now() - backupStarted,
                success: true,
              });
              if (text !== undefined && text !== null) {
                return { text };
              }
            } catch (backupErr: any) {
              backupController.abort();
              this.logger.warn(
                `Backup Gemini model "${backupModel}" failed: ${String(backupErr?.message || backupErr).slice(0, 100)}`,
              );
            }
          }
        }
      }
    }

    // (اختياري: في حال تم تفعيل Claude كمزود إضافي)
    if (this.claude && !paidBlocked) {
      const started = Date.now();
      let claudeUsage: ClaudeUsage | undefined;
      try {
        const text = await this.claude.generate({
          contents: params.contents,
          schema: params.config?.responseSchema,
          effort: params.effort ?? 'medium',
          timeoutMs: params.claudeTimeoutMs ?? 180_000,
          onUsage: (u) => (claudeUsage = u),
        });
        this.recordClaude(task, started, true, claudeUsage);
        const wantsJson =
          params.config?.responseSchema ||
          params.config?.responseMimeType === 'application/json';
        return { text: wantsJson ? stripJsonFence(text) : text };
      } catch (err) {
        this.recordClaude(task, started, false, claudeUsage, err);
        if (!this.openRouterKey || !isTransientClaudeError(err)) throw err;
        this.logger.warn(
          `Claude unavailable (${String(err).slice(0, 120)}); falling back to OpenRouter`,
        );
      }
    }

    // 2. المزود الاحتياطي (Fallback Provider): OpenRouter بالنماذج المجانية مع max_tokens: 4096
    if (!this.openRouterKey) {
      throw new ServiceUnavailableException(
        paidBlocked
          ? 'تم بلوغ سقف الصرف الشهري للذكاء الاصطناعي. ارفع السقف من «الاستهلاك والحصص» أو أوقف الإيقاف الصارم.'
          : 'AI service unavailable: Google Gemini failed or is not configured, and OPENROUTER_API_KEY is not set.',
      );
    }

    const candidates = [
      preferredModel,
      routeModel,
      this.generationModel,
      this.parserModel,
      ...this.fallbackModels,
    ];
    const modelsToTry = Array.from(
      new Set(candidates.filter(Boolean) as string[]),
    ).filter((m) => !paidBlocked || isFreeModel(m));
    if (modelsToTry.length === 0) {
      throw new ServiceUnavailableException(
        'تم بلوغ سقف الصرف الشهري ولا يوجد نموذج مجاني مضبوط للمتابعة.',
      );
    }
    let lastError: any = null;
    const deadline = Date.now() + totalTimeout;

    for (const model of modelsToTry) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.logger.error(
          `AI fallback chain exceeded ${totalTimeout}ms; giving up before trying "${model}"`,
        );
        break;
      }

      const controller = new AbortController();
      const started = Date.now();
      try {
        const { text, usage } = await withTimeout(
          this.callOpenRouter(
            model,
            params.contents,
            requestConfig,
            controller.signal,
            taskRoute?.maxTokens,
          ),
          Math.min(attemptTimeout, remaining),
          model,
        );
        this.usage?.record({
          task,
          provider: 'openrouter',
          model,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          costUsd: usage?.cost,
          latencyMs: Date.now() - started,
          success: true,
        });
        return { text };
      } catch (err: any) {
        controller.abort();
        lastError = err;
        this.usage?.record({
          task,
          provider: 'openrouter',
          model,
          latencyMs: Date.now() - started,
          success: false,
          error: errorText(err),
        });
        const msg = err?.message ?? String(err);
        const isQuotaOrCapacity =
          err instanceof AiTimeoutError ||
          /\b(402|404|408|429|502|503)\b/.test(msg) ||
          msg.includes('No endpoints found') ||
          msg.includes('not a valid model') ||
          msg.includes('Quota exceeded') ||
          msg.includes('requires more credits') ||
          msg.includes('high demand');

        if (isQuotaOrCapacity) {
          this.logger.warn(
            `OpenRouter fallback model "${model}" unavailable (${msg.slice(0, 120)}...). Falling back to next model...`,
          );
          continue;
        }

        throw err;
      }
    }

    this.logger.error(
      `All AI providers and fallback models exhausted. Last error: ${lastError?.message}`,
    );
    throw (
      lastError ??
      new Error('AI request failed: no model produced a response in time')
    );
  }

  /**
   * Send a PDF or image buffer to Gemini for multimodal extraction.
   * Returns an array of structured questions with LaTeX-normalized formulas.
   */
  async extractQuestionsFromFile(
    fileBuffer: Buffer,
    mimeType: string = 'application/pdf',
    options: ExtractionOptions = {},
  ): Promise<ExtractedQuestionWithMeta[]> {
    const base64 = fileBuffer.toString('base64');
    const keepLatex = options.keepLatex ?? true;
    const language =
      OCR_LANGUAGE_HINT[options.ocrLang ?? 'ara+eng'] ??
      OCR_LANGUAGE_HINT['ara+eng'];
    const formulaRule = keepLatex
      ? 'Normalize ALL formulas into valid LaTeX: use $...$ for inline math and $$...$$ for display/block math.'
      : 'Write formulas as readable plain text (e.g. x^2, √(x), (a)/(b), H2O) — do NOT use LaTeX or $ signs.';
    const unitsHint = options.units?.length
      ? `\nKnown curriculum units${options.subjectName ? ` for "${options.subjectName}"` : ''}: ${options.units.map((u) => `"${u}"`).join(', ')}. Pick suggestedUnit from this list when one fits.`
      : '';

    const response = await this.generateContentWithFallback({
      task: 'extraction',
      preferredModel: this.parserModel,
      effort: 'medium',
      claudeTimeoutMs: 600_000,
      // ورقة امتحان كاملة بتاخد وقت أطول من رسالة محادثة
      attemptTimeoutMs: 120_000,
      totalTimeoutMs: 300_000,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: `You are an expert exam question parser. Extract ALL multiple-choice questions from this exam document (PDF or image). The document is written in ${language}.

For each question:
1. Extract the full question text exactly as printed, preserving all mathematical and chemical formulas.
2. ${formulaRule}
3. Extract all answer choices with their labels (A, B, C, D, etc.). Map Arabic labels أ/ب/ج/د to A/B/C/D.
4. Identify the correct answer label if marked in the document.
5. Provide a brief explanation if available.
   Quranic verses, hadith and poetry: copy them exactly with every diacritic as printed, and wrap Quranic verses in ﴿ ﴾.
   ${JSON_LATEX_ESCAPING}
6. number: the question number as printed.
7. confidence: 0–1, how sure you are that the text, every choice and the correct answer were read exactly right. Lower it for blurry scans, cut-off text, or a guessed answer.
8. suggestedDifficulty and suggestedBloom: your pedagogical estimate.
9. suggestedUnit: the curriculum unit the question belongs to.${unitsHint}
10. issues: short Arabic notes on anything a reviewer must check (for example the marked answer contradicts the explanation). Empty array if none.

Return the results as a JSON object with a "questions" array.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
      },
    });

    const text = response.text ?? '';
    let parsed: { questions: ExtractedQuestionWithMeta[] };

    try {
      parsed = parseModelJson(text);
    } catch {
      this.logger.error(`AI returned invalid JSON: ${text.slice(0, 500)}`);
      throw new InternalServerErrorException(
        'AI returned non-parseable JSON output',
      );
    }

    if (!Array.isArray(parsed.questions)) {
      throw new InternalServerErrorException(
        'Gemini response missing "questions" array',
      );
    }

    this.logger.log(
      `Extracted ${parsed.questions.length} questions from ${mimeType} via ${this.parserModel}`,
    );
    return parsed.questions;
  }

  /**
   * Generate exam questions using structured JSON output.
   * Implements self-healing retry: on schema validation failure, the error is
   * appended to the prompt and Gemini is called again (up to `maxRetries` times).
   * Throws BadGatewayException if all attempts fail.
   */
  async generateQuestions(
    systemPrompt: string,
    count: number,
    maxRetries = 1,
  ): Promise<GeneratedQuestion[]> {
    let lastError = '';
    let conversationHistory: { role: string; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
    ];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.generateContentWithFallback({
          task: 'generation',
          preferredModel: this.generationModel,
          effort: 'high',
          contents: conversationHistory,
          config: {
            responseMimeType: 'application/json',
            responseSchema: GENERATION_SCHEMA,
          },
        });

        const text = response.text ?? '';
        let parsed: any;

        try {
          parsed = parseModelJson(text);
        } catch (parseErr) {
          lastError = `JSON parse error: ${String(parseErr)}`;
          this.logger.warn(
            `Attempt ${attempt + 1}: JSON parse failed — ${lastError}`,
          );
          // Add model response + repair instruction for next attempt
          conversationHistory = [
            ...conversationHistory,
            { role: 'model', parts: [{ text }] },
            {
              role: 'user',
              parts: [
                {
                  text: `Your previous response was not valid JSON. Error: ${lastError}\nPlease regenerate exactly ${count} questions as valid JSON matching the schema.`,
                },
              ],
            },
          ];
          continue;
        }

        // Validate schema shape (supports { questions: [...] }, [...], or any object containing an array)
        let rawQuestions: any[] = [];
        if (Array.isArray(parsed)) {
          rawQuestions = parsed;
        } else if (Array.isArray(parsed?.questions)) {
          rawQuestions = parsed.questions;
        } else if (Array.isArray(parsed?.items)) {
          rawQuestions = parsed.items;
        } else if (Array.isArray(parsed?.mcqs)) {
          rawQuestions = parsed.mcqs;
        } else if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(parsed)) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              rawQuestions = parsed[key];
              break;
            }
          }
        }

        if (rawQuestions.length === 0) {
          lastError = 'Response missing "questions" array or array is empty';
          this.logger.warn(`Attempt ${attempt + 1}: ${lastError}`);
          conversationHistory = [
            ...conversationHistory,
            { role: 'model', parts: [{ text }] },
            {
              role: 'user',
              parts: [
                {
                  text: `Validation error: ${lastError}\nPlease regenerate exactly ${count} questions as valid JSON matching the schema.`,
                },
              ],
            },
          ];
          continue;
        }

        // Validate and sanitize questions
        const validQuestions: GeneratedQuestion[] = rawQuestions
          .filter((q) => q && (q.questionText || q.question || q.text))
          .map((q: any) => {
            const questionText = q.questionText || q.question || q.text || '';
            let choices = q.choices;
            if (!Array.isArray(choices) && typeof choices === 'object' && choices !== null) {
              choices = Object.entries(choices).map(([label, text]) => ({ label, text: String(text) }));
            }
            if (Array.isArray(choices)) {
              choices = choices.map((c: any, cIdx: number) => {
                if (typeof c === 'string') {
                  return { label: String.fromCharCode(65 + cIdx), text: c };
                }
                return {
                  label: c.label || c.key || String.fromCharCode(65 + cIdx),
                  text: c.text || c.choiceText || c.content || '',
                };
              });
            }
            return {
              questionText,
              choices: Array.isArray(choices) ? choices : [],
              correctAnswer: q.correctAnswer || q.answer || 'A',
              explanation: q.explanation || q.reason || '',
              bloomTaxonomy: q.bloomTaxonomy || 'APPLY',
            };
          })
          .filter((q) => q.choices.length > 0);

        if (validQuestions.length === 0) {
          lastError = 'No valid questions found with choices and questionText';
          this.logger.warn(`Attempt ${attempt + 1}: ${lastError}`);
          continue;
        }

        this.logger.log(
          `Generated ${validQuestions.length} questions (attempt ${attempt + 1})`,
        );
        return validQuestions.slice(0, count);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          this.logger.warn(
            `Attempt ${attempt + 1} failed with upstream error: ${lastError}. Retrying...`,
          );
        }
      }
    }

    this.logger.error(
      `All ${maxRetries + 1} generation attempts exhausted. Last error: ${lastError}`,
    );
    throw new BadGatewayException(
      'AI question generation failed after multiple retries. Please try again later.',
    );
  }

  /**
   * Analyze a question sheet (PDF or image) and extract its style blueprint.
   * Returns a StyleMatrix JSON object cached by the caller.
   */
  async extractStyleMatrix(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<StyleMatrix> {
    const base64 = fileBuffer.toString('base64');

    const response = await this.generateContentWithFallback({
      task: 'style',
      preferredModel: this.parserModel,
      effort: 'medium',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: `You are an expert educational assessment analyst. Analyze this question sheet document and extract a comprehensive style blueprint.

Analyze and report:
1. Average question length (word count per question)
2. LaTeX math notation density (LOW = <20%, MEDIUM = 20-60%, HIGH = >60% of questions)
3. Distractor (wrong answer) complexity level
4. Dominant Bloom's Taxonomy cognitive level
5. Key observations about question phrasing, tone, and structure style
6. 2-3 verbatim sample questions from the document

Return a JSON style matrix object matching the schema.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: STYLE_MATRIX_SCHEMA,
      },
    });

    const text = response.text ?? '';
    let parsed: StyleMatrix;

    try {
      parsed = parseModelJson<StyleMatrix>(text);
    } catch {
      this.logger.error(
        `Style matrix extraction returned invalid JSON: ${text.slice(0, 300)}`,
      );
      throw new InternalServerErrorException(
        'AI style extraction returned non-parseable JSON',
      );
    }

    this.logger.log(`Style matrix extracted successfully`);
    return parsed;
  }

  /**
   * Generate a vector embedding for the given text.
   * Returns a float array of `embeddingDimensions` dimensions.
   */
  async generateEmbedding(
    text: string,
    kind: EmbeddingKind = 'passage',
  ): Promise<number[]> {
    const [values] = await this.generateEmbeddings([text], kind);
    return values;
  }

  /**
   * تضمين دفعة نصوص بطلب واحد (حتى EMBEDDING_BATCH_SIZE). الترتيب
   * بالنتيجة نفس ترتيب المدخلات.
   */
  async generateEmbeddings(
    texts: string[],
    /** سؤال بحث أو نص مخزّن — بعض النماذج (e5) بتميّز بيناتهم */
    kind: EmbeddingKind = 'passage',
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.length > EMBEDDING_BATCH_SIZE) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
        out.push(
          ...(await this.generateEmbeddings(
            texts.slice(i, i + EMBEDDING_BATCH_SIZE),
            kind,
          )),
        );
      }
      return out;
    }

    const info = this.embeddingInfo();
    if (!info.enabled) {
      throw new ServiceUnavailableException(
        'Embeddings are disabled: check EMBEDDING_PROVIDER and its API key',
      );
    }
    if (info.provider === 'local') {
      // أبعاد النموذج المحلي ثابتة — ما في قص
      return this.localEmbedder!.embed(texts, kind);
    }

    let vectors: number[][];
    const started = Date.now();
    const record = (success: boolean, err?: unknown) =>
      this.usage?.record({
        task: 'embedding',
        provider: info.provider === 'gemini' ? 'gemini' : 'openrouter',
        model: info.model ?? 'unknown',
        latencyMs: Date.now() - started,
        success,
        error: err === undefined ? undefined : errorText(err),
      });
    try {
      if (info.provider === 'gemini') {
        const response = await this.ai!.models.embedContent({
          model: this.embeddingModel,
          contents: texts,
          config: { outputDimensionality: this.embeddingDimensions },
        });
        vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
      } else {
        vectors = await this.openRouterEmbeddings(texts);
      }
    } catch (err) {
      record(false, err);
      throw err;
    }
    // التضمين المحلي (الافتراضي) مجاني وعلى السيرفر — ما بينسجّل
    record(true);

    if (vectors.length !== texts.length || vectors.some((v) => !v?.length)) {
      throw new InternalServerErrorException(
        `Embedding provider returned ${vectors.length} vectors for ${texts.length} inputs`,
      );
    }
    // القص مسموح بس لما النموذج نفسه قبل dimensions (Gemini عبر المزوّدين
    // بيدعم Matryoshka). نموذج بأبعاد ثابتة ما منقصّه — منطلب ضبط الإعداد.
    if (
      this.fixedDimensionModels.has(this.openRouterEmbeddingModel) &&
      info.provider === 'openrouter'
    ) {
      const got = vectors[0].length;
      if (got !== this.embeddingDimensions) {
        throw new ServiceUnavailableException(
          `Embedding model "${this.openRouterEmbeddingModel}" always returns ${got} dimensions: set EMBEDDING_DIMENSIONS=${got} and re-embed`,
        );
      }
      return vectors;
    }
    return vectors.map((v) => fitDimensions(v, this.embeddingDimensions));
  }

  /** نماذج رفضت باراميتر dimensions — منبطّل نبعته إلها */
  private readonly fixedDimensionModels = new Set<string>();

  private async openRouterEmbeddings(texts: string[]): Promise<number[][]> {
    const model = this.openRouterEmbeddingModel;
    const withDims = !this.fixedDimensionModels.has(model);
    const controller = new AbortController();
    const res = await withTimeout(
      fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.openRouterKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'AI Exam',
        },
        body: JSON.stringify({
          model,
          input: texts,
          ...(withDims && { dimensions: this.embeddingDimensions }),
        }),
      }),
      60_000,
      model,
    ).catch((err) => {
      controller.abort();
      throw err;
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      const message: string = body?.error?.message ?? res.statusText;
      // بعض النماذج بأبعاد ثابتة بترفض dimensions (مثلاً nemotron-3-embed: 2048 بس)
      if (withDims && res.status === 400 && /dimension/i.test(message)) {
        this.fixedDimensionModels.add(model);
        this.logger.warn(
          `Embedding model ${model} rejects "dimensions"; using its native size`,
        );
        return this.openRouterEmbeddings(texts);
      }
      throw new BadGatewayException(
        `OpenRouter embeddings ${body?.error?.code ?? res.status}: ${message}`,
      );
    }
    const data: { index?: number; embedding: number[] }[] = body?.data ?? [];
    return [...data]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding);
  }

  /**
   * تعرّف ضوئي: بيفرّغ صفحات PDF (أو صورة) لنص حرفي بالنموذج. العناوين
   * بتطلع بصيغة Markdown (#, ##, ###) حتى التقطيع حسب البنية يلقاها.
   *
   * الناتج نص عادي بفواصل صفحات بدل JSON: تفريغ صفحات فيها LaTeX جوّا
   * JSON بيكسر كتير (الـ backslash لازم ينهرب)، والفاصل أمتن.
   */
  async transcribePages(
    fileBuffer: Buffer,
    mimeType: string,
    opts: {
      firstPage: number;
      pageCount: number;
      ocrLang?: string;
      keepLatex?: boolean;
    },
  ): Promise<{ page: number; text: string }[]> {
    const language =
      OCR_LANGUAGE_HINT[opts.ocrLang ?? 'ara+eng'] ??
      OCR_LANGUAGE_HINT['ara+eng'];
    const formulaRule =
      (opts.keepLatex ?? true)
        ? 'Write every mathematical or chemical formula in LaTeX: $...$ inline, $$...$$ on its own line.'
        : 'Write formulas as readable plain text (x^2, √(x), (a)/(b), H2O) — no LaTeX, no $ signs.';
    const last = opts.firstPage + opts.pageCount - 1;

    const response = await this.generateContentWithFallback({
      task: 'transcription',
      preferredModel: this.parserModel,
      effort: 'low',
      claudeTimeoutMs: 600_000,
      // النماذج المجانية بتاخد أحياناً ٢–٣ دقايق على دفعة ٤ صفحات (مقاس من
      // كتاب حقيقي)؛ ٩٠ ث كانت تسقّط دفعات كانت رح تنجح
      attemptTimeoutMs: 150_000,
      totalTimeoutMs: 320_000,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: fileBuffer.toString('base64') } },
            {
              text: `Transcribe this school textbook excerpt word for word. It is written in ${language}. It contains ${opts.pageCount} page(s), numbered ${opts.firstPage} to ${last} in the book.

Rules:
- Start each page with a line exactly like: ===== PAGE <number> ===== (use the book numbering ${opts.firstPage}..${last}).
- Copy the text faithfully in reading order. Do not summarize, translate, explain or add anything.
- Mark headings with Markdown: "# " for units, "## " for chapters/lessons, "### " for sections.
- ${formulaRule}
- Separate paragraphs with a blank line. Render tables as simple rows separated by " | ".
- Describe figures only by their caption, if any.
- If a page is blank, write only its PAGE line.`,
            },
          ],
        },
      ],
    });

    // النماذج أحياناً بتلف الناتج بـ ``` أو بتعيد وسوم مثل </file> — مش من الكتاب
    const text = (response.text ?? '')
      .replace(/^\s*```[a-z]*\s*$/gim, '')
      .replace(/<\/?(?:file|document|page|text)>/gi, '');
    return splitTranscribedPages(text, opts.firstPage, opts.pageCount);
  }

  /**
   * جواب نصي حر (شرح للطالب) — بدون JSON ولا مخطط.
   */
  async generateText(
    contents: { role: 'user' | 'model'; parts: { text: string }[] }[],
  ): Promise<string> {
    const response = await this.generateContentWithFallback({
      task: 'answer',
      preferredModel: this.generationModel,
      effort: 'medium',
      claudeTimeoutMs: 90_000,
      contents,
    });
    return (response.text ?? '').trim();
  }

  /**
   * Classify a student's free-text message into a structured intent.
   * Returns raw JSON text for the caller to parse.
   */
  async classifyIntent(prompt: string): Promise<string> {
    const response = await this.generateContentWithFallback({
      task: 'classification',
      preferredModel: this.generationModel,
      effort: 'low',
      claudeTimeoutMs: 60_000,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text ?? '';
    this.logger.debug(
      `Intent classification raw response: ${text.slice(0, 300)}`,
    );
    return text;
  }

  /**
   * Validate whether an uploaded file's content matches the expected subject.
   * Uses multimodal analysis to detect the subject of the file content.
   * Returns raw JSON text for the caller to parse.
   */
  async validateFileContent(
    fileBuffer: Buffer,
    mimeType: string,
    expectedSubject: string,
    branchName: string,
  ): Promise<string> {
    const base64 = fileBuffer.toString('base64');

    const response = await this.generateContentWithFallback({
      task: 'validation',
      preferredModel: this.parserModel,
      effort: 'low',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: `You are a content validator for a Palestinian Tawjihi (الثانوية العامة) exam preparation system.

The student is currently in a chat session for the subject: "${expectedSubject}" (Branch: "${branchName}").
They uploaded this file. Analyze the file content and determine:

1. What subject does this file's content belong to?
2. Is the content relevant and appropriate for "${expectedSubject}"?
3. Does it contain exam questions, educational material, or study content?

Respond with ONLY a valid JSON object:
{
  "isRelevant": true | false,
  "detectedSubject": "the subject you detected in the file",
  "confidence": 0.95,
  "reason": "Brief explanation in Arabic of your assessment"
}

Rules:
- If the file contains questions/content about "${expectedSubject}", set isRelevant = true
- If the file is about a DIFFERENT subject entirely, set isRelevant = false
- If the file contains non-educational content (memes, personal photos, etc.), set isRelevant = false
- If you cannot determine the content (corrupted, unreadable), set isRelevant = false with reason explaining why`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    return response.text ?? '';
  }
}
