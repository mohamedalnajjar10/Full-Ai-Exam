import path from 'path';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * تضمين محلي بنموذج مفتوح المصدر (ONNX عبر Transformers.js) — مجاني، بدون
 * مفتاح، بدون حدود يومية. multilingual-e5 بيدعم العربي وبيقرا لحد 512
 * توكن، فمقطع كامل من الكتاب بينضمّن بدون قص.
 *
 * النموذج بينزل مرة وحدة (~130 م.ب لـ small) لـ .cache/models وبعدها كله محلي.
 */
export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

/** أبعاد النماذج المعروفة — لغيرها منعرف الأبعاد من أول متجه */
const KNOWN_DIMENSIONS: Record<string, number> = {
  'Xenova/multilingual-e5-small': 384,
  'Xenova/multilingual-e5-base': 768,
  'Xenova/multilingual-e5-large': 1024,
};

export type EmbeddingKind = 'query' | 'passage';

export class LocalEmbedder {
  private pipe: Promise<FeatureExtractionPipeline> | null = null;
  private dims: number | null;

  constructor(
    readonly model: string = DEFAULT_LOCAL_EMBEDDING_MODEL,
    private readonly cacheDir = path.resolve(process.cwd(), '.cache/models'),
  ) {
    this.dims = KNOWN_DIMENSIONS[model] ?? null;
  }

  get dimensions(): number | null {
    return this.dims;
  }

  private load(): Promise<FeatureExtractionPipeline> {
    this.pipe ??= (async () => {
      // المكتبة ESM-first؛ الاستيراد الديناميكي بيأجّل تحميلها لأول تضمين
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = this.cacheDir;
      return await pipeline('feature-extraction', this.model, {
        dtype: 'q8',
      });
    })().catch((err) => {
      this.pipe = null; // تحميل فاشل (شبكة) ما لازم يعلق للأبد
      throw err;
    });
    return this.pipe;
  }

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    const extractor = await this.load();
    // نماذج e5 متدرّبة على بادئة تميّز السؤال عن النص
    const inputs = this.model.includes('e5')
      ? texts.map((t) => `${kind}: ${t}`)
      : texts;
    const output = await extractor(inputs, {
      pooling: 'mean',
      normalize: true,
    });
    const vectors = output.tolist() as number[][];
    this.dims ??= vectors[0]?.length ?? null;
    return vectors;
  }
}
