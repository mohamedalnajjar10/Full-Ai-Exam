import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import {
  isTransientClaudeError,
  strictSchema,
  toClaudeMessages,
} from './claude.client';
import { GeminiService } from './gemini.service';
import type { AiUsageService } from '../usage/ai-usage.service';

describe('toClaudeMessages', () => {
  it('maps PDFs to document blocks, images to image blocks, and model turns to assistant', () => {
    const messages = toClaudeMessages([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: 'UERG' } },
          { inlineData: { mimeType: 'image/png', data: 'iVBO' } },
          { text: 'فرّغ الصفحات' },
        ],
      },
      { role: 'model', parts: [{ text: 'تم' }] },
    ]);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: 'UERG',
            },
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBO' },
          },
          { type: 'text', text: 'فرّغ الصفحات' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'تم' }] },
    ]);
  });

  it('rejects file types Claude cannot read instead of sending them', () => {
    expect(() =>
      toClaudeMessages([
        { parts: [{ inlineData: { mimeType: 'application/zip', data: 'x' } }] },
      ]),
    ).toThrow('application/zip');
  });
});

describe('strictSchema', () => {
  it('adds additionalProperties: false to every object, nested ones included', () => {
    const schema = {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { a: { type: 'string', enum: ['x'] } },
          },
        },
      },
      required: ['questions'],
    };
    expect(strictSchema(schema)).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { a: { type: 'string', enum: ['x'] } },
          },
        },
      },
      required: ['questions'],
    });
  });
});

describe('GeminiService with Claude as the primary provider', () => {
  const fetchMock = jest.fn();
  let service: GeminiService;
  let claudeGenerate: jest.SpyInstance;

  function build(env: Record<string, string>, usage?: unknown) {
    const config = {
      get: (k: string, d?: unknown) => env[k] ?? d,
    } as unknown as ConfigService;
    const s = new GeminiService(config, usage as AiUsageService | undefined);
    s.onModuleInit();
    return s;
  }

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'from openrouter' } }],
      }),
    });
    global.fetch = fetchMock;
    service = build({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENROUTER_API_KEY: 'sk-or-test',
    });
    claudeGenerate = jest.spyOn((service as any).claude, 'generate');
  });

  it('sends the request to Claude with the task effort and the JSON schema', async () => {
    claudeGenerate.mockResolvedValue('```json\n{"ok":true}\n```');
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const res = await service.generateContentWithFallback({
      contents: 'hi',
      config: { responseSchema: schema },
      effort: 'low',
      claudeTimeoutMs: 1000,
    });
    expect(res.text).toBe('{"ok":true}');
    expect(claudeGenerate).toHaveBeenCalledWith({
      contents: 'hi',
      schema,
      effort: 'low',
      timeoutMs: 1000,

      onUsage: expect.any(Function),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to OpenRouter when Claude is overloaded', async () => {
    claudeGenerate.mockRejectedValue(
      new Anthropic.APIConnectionError({ message: 'socket hang up' }),
    );
    const res = await service.generateContentWithFallback({ contents: 'hi' });
    expect(res.text).toBe('from openrouter');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not hide request errors behind the fallback', async () => {
    const bad = Object.assign(
      Object.create(Anthropic.BadRequestError.prototype),
      { status: 400, message: 'bad pdf' },
    );
    claudeGenerate.mockRejectedValue(bad);
    await expect(
      service.generateContentWithFallback({ contents: 'hi' }),
    ).rejects.toBe(bad);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads bigger page batches with Claude', () => {
    expect(service.documentPagesPerRequest('ocr')).toBe(10);
    expect(
      build({ OPENROUTER_API_KEY: 'k' }).documentPagesPerRequest('ocr'),
    ).toBe(4);
  });

  it('defaults to local embeddings when there is no Gemini key', () => {
    expect(service.embeddingInfo()).toMatchObject({
      enabled: true,
      provider: 'local',
      dimensions: 384,
    });
    expect(
      build({
        OPENROUTER_API_KEY: 'k',
        EMBEDDING_PROVIDER: 'openrouter',
      }).embeddingInfo().provider,
    ).toBe('openrouter');
  });

  it('classifies transient errors', () => {
    expect(
      isTransientClaudeError(
        new Anthropic.APIConnectionError({ message: 'x' }),
      ),
    ).toBe(true);
    expect(isTransientClaudeError(new Error('x'))).toBe(false);
  });

  /* eslint-disable @typescript-eslint/require-await --
     نفس أسلوب اختبارات الملف: الوصول لـ claude الخاص ولـ mock.calls بيرجع any */
  describe('usage logging', () => {
    const usage = {
      record: jest.fn(),
      paidModelsBlocked: jest.fn().mockResolvedValue(false),
    };
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      ANTHROPIC_MODEL: 'claude-opus-5-5',
      OPENROUTER_API_KEY: 'sk-or-test',
      OPENROUTER_GENERATION_MODEL: 'paid/model',
      OPENROUTER_FALLBACK_MODELS: 'cheap/model:free',
    };

    beforeEach(() => {
      usage.record.mockReset();
      usage.paidModelsBlocked.mockReset().mockResolvedValue(false);
    });

    it('records Claude calls with tokens and cost', async () => {
      const s = build(env, usage);
      jest
        .spyOn((s as any).claude, 'generate')
        .mockImplementation(async (p: any) => {
          p.onUsage({
            input_tokens: 1_000_000,
            output_tokens: 100_000,
            cache_read_input_tokens: 1_000_000,
          });
          return 'ok';
        });
      await s.generateContentWithFallback({ contents: 'hi', task: 'answer' });
      const call = usage.record.mock.calls[0][0];
      expect(call).toMatchObject({
        task: 'answer',
        provider: 'anthropic',
        success: true,
        inputTokens: 2_000_000,
        outputTokens: 100_000,
      });
      // 1M × $4 + 1M cache reads × $0.40 + 100K × $20/M
      expect(call.costUsd).toBeCloseTo(4 + 0.4 + 2, 5);
    });

    it("records OpenRouter calls with the provider's reported cost", async () => {
      const s = build({ OPENROUTER_API_KEY: 'k' }, usage);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'x' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0021 },
        }),
      });
      await s.generateContentWithFallback({
        contents: 'hi',
        task: 'classification',
      });
      expect(usage.record).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'classification',
          provider: 'openrouter',
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.0021,
          success: true,
        }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.usage).toEqual({ include: true });
    });

    it('records failed attempts too', async () => {
      const s = build(env, usage);
      jest
        .spyOn((s as any).claude, 'generate')
        .mockRejectedValue(
          new Anthropic.APIConnectionError({ message: 'socket hang up' }),
        );
      await s.generateContentWithFallback({ contents: 'hi' });
      expect(usage.record.mock.calls[0][0]).toMatchObject({
        provider: 'anthropic',
        success: false,
        task: 'other',
      });
      expect(usage.record.mock.calls[1][0]).toMatchObject({
        provider: 'openrouter',
        success: true,
      });
    });

    it('skips paid models once the hard budget stop is hit', async () => {
      usage.paidModelsBlocked.mockResolvedValue(true);
      const s = build(env, usage);
      const generate = jest.spyOn((s as any).claude, 'generate');
      await s.generateContentWithFallback({ contents: 'hi' });
      expect(generate).not.toHaveBeenCalled();
      const models = fetchMock.mock.calls.map(
        (c) => JSON.parse(c[1].body).model,
      );
      expect(models).toEqual(['cheap/model:free']);
    });
  });
  /* eslint-enable @typescript-eslint/require-await */
});
