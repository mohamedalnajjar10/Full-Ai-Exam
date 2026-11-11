import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { GeminiService } from '../../gemini/gemini.service';
import { ContentValidationResult } from '../interfaces/chat.interfaces';
import { PrismaService } from '../../prisma/prisma.service';

export interface GuardrailSettingsConfig {
  strictness?: 'lenient' | 'balanced' | 'strict';
  confidenceThreshold?: number;
  fileValidationEnabled?: boolean;
  fileConfidenceThreshold?: number;
  piiMaskingEnabled?: boolean;
  rateLimitPerMinute?: number;
  autoSuspendAbuse?: boolean;
  rejectionMessage?: string;
}

/**
 * Validates that uploaded file content and student messages are relevant
 * to the session's subject. Uses Gemini multimodal analysis for file validation.
 * Acts as the guardrail layer preventing off-topic content processing.
 * Dynamically synchronized with AppSetting ('ai_guardrails') via an in-memory TTL cache.
 */
@Injectable()
export class ContentGuardrailService implements OnModuleInit {
  private readonly logger = new Logger(ContentGuardrailService.name);

  private cachedGuardrails: GuardrailSettingsConfig | null = null;
  private cachedGuardrailsExpiresAt = 0;
  private readonly GUARDRAILS_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly gemini: GeminiService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    if (this.prisma) {
      this.refreshGuardrailsCache().catch((err) => {
        this.logger.warn(
          `Failed to preload guardrails settings from AppSetting: ${String(err)}`,
        );
      });
    }
  }

  async getGuardrailSettings(): Promise<GuardrailSettingsConfig> {
    const now = Date.now();
    if (!this.cachedGuardrails || now > this.cachedGuardrailsExpiresAt) {
      await this.refreshGuardrailsCache();
    }
    return this.cachedGuardrails ?? this.defaultGuardrails();
  }

  private async refreshGuardrailsCache(): Promise<void> {
    if (!this.prisma) {
      this.cachedGuardrails = this.defaultGuardrails();
      this.cachedGuardrailsExpiresAt = Date.now() + this.GUARDRAILS_CACHE_TTL_MS;
      return;
    }
    try {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key: 'ai_guardrails' },
      });
      if (setting?.value && typeof setting.value === 'object') {
        const val = setting.value as any;
        this.cachedGuardrails = {
          strictness: val.strictness ?? 'balanced',
          confidenceThreshold:
            typeof val.confidenceThreshold === 'number'
              ? val.confidenceThreshold
              : 0.7,
          fileValidationEnabled: val.fileValidationEnabled !== false,
          fileConfidenceThreshold:
            typeof val.fileConfidenceThreshold === 'number'
              ? val.fileConfidenceThreshold
              : 0.75,
          piiMaskingEnabled: val.piiMaskingEnabled !== false,
          rateLimitPerMinute:
            typeof val.rateLimitPerMinute === 'number'
              ? val.rateLimitPerMinute
              : 10,
          autoSuspendAbuse: val.autoSuspendAbuse !== false,
          rejectionMessage:
            typeof val.rejectionMessage === 'string'
              ? val.rejectionMessage
              : undefined,
        };
      } else {
        this.cachedGuardrails = this.defaultGuardrails();
      }
      this.cachedGuardrailsExpiresAt = Date.now() + this.GUARDRAILS_CACHE_TTL_MS;
    } catch {
      this.cachedGuardrails = this.defaultGuardrails();
      this.cachedGuardrailsExpiresAt = Date.now() + 10_000;
    }
  }

  private defaultGuardrails(): GuardrailSettingsConfig {
    return {
      strictness: 'balanced',
      confidenceThreshold: 0.7,
      fileValidationEnabled: true,
      fileConfidenceThreshold: 0.75,
      piiMaskingEnabled: true,
      rateLimitPerMinute: 10,
      autoSuspendAbuse: true,
    };
  }

  /**
   * Validate whether an uploaded file's content matches the expected subject.
   * Uses Gemini multimodal to detect what subject the file belongs to.
   *
   * @param fileBuffer  Raw file buffer (PDF or image)
   * @param mimeType    Resolved MIME type
   * @param subjectName Expected subject name
   * @param branchName  Academic branch name
   * @returns Validation result with relevance flag and reason
   */
  async validateFileContent(
    fileBuffer: Buffer,
    mimeType: string,
    subjectName: string,
    branchName: string,
  ): Promise<ContentValidationResult> {
    const guardrails = await this.getGuardrailSettings();

    // 1. If administrator disabled file validation in guardrail settings
    if (guardrails.fileValidationEnabled === false) {
      this.logger.log(
        `File validation disabled by admin guardrail settings; skipping check.`,
      );
      return {
        isRelevant: true,
        confidence: 1,
        reason: 'تم تجاوز التحقق بناءً على إعدادات الأمان المحددة من الإدارة.',
      };
    }

    try {
      const responseText = await this.gemini.validateFileContent(
        fileBuffer,
        mimeType,
        subjectName,
        branchName,
      );

      const parsed = this.parseValidationResponse(responseText, subjectName);

      // Check confidence threshold from admin guardrail settings
      const threshold = guardrails.fileConfidenceThreshold ?? 0.75;
      if (parsed.isRelevant && parsed.confidence < threshold) {
        this.logger.warn(
          `File validation confidence (${parsed.confidence}) below admin threshold (${threshold}). Rejecting file.`,
        );
        parsed.isRelevant = false;
        parsed.reason = `درجة مطابقة محتوى الملف للمادة (${Math.round(parsed.confidence * 100)}%) أقل من الحد الأدنى المعتمد (${Math.round(threshold * 100)}%).`;
      }

      return parsed;
    } catch (err) {
      this.logger.error(
        `File content validation failed: ${String(err)}. Rejecting file to uphold security guardrail (fail-closed).`,
      );
      // Fail-closed / Fail-safe: prevent unverified files from bypassing subject constraints
      return {
        isRelevant: false,
        confidence: 0,
        reason:
          'تعذر التحقق من محتوى الملف للتأكد من ملاءمته للمادة الدراسية بسبب خطأ في المعالجة. يرجى المحاولة مرة أخرى.',
      };
    }
  }

  /**
   * Parse the raw Gemini validation JSON response.
   */
  private parseValidationResponse(
    responseText: string,
    expectedSubject: string,
  ): ContentValidationResult {
    try {
      const parsed = JSON.parse(responseText);

      const result: ContentValidationResult = {
        isRelevant: Boolean(parsed.isRelevant),
        detectedSubject: parsed.detectedSubject ?? undefined,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason:
          parsed.reason ??
          (parsed.isRelevant
            ? `المحتوى متوافق مع مادة "${expectedSubject}"`
            : `المحتوى غير متوافق مع مادة "${expectedSubject}"`),
      };

      this.logger.log(
        `File validation: relevant=${result.isRelevant}, detected="${result.detectedSubject}", expected="${expectedSubject}", confidence=${result.confidence}`,
      );

      return result;
    } catch (err) {
      this.logger.warn(
        `Failed to parse validation response: ${String(err)}. Raw: ${responseText.slice(0, 300)}`,
      );

      return {
        isRelevant: false,
        confidence: 0,
        reason: 'تعذر التحقق من محتوى الملف بشكل دقيق. يرجى إعادة المحاولة.',
      };
    }
  }

  /**
   * Build the off-topic rejection message for the student.
   * Used when an intent is classified as OFF_TOPIC or a file fails validation.
   */
  buildOffTopicResponse(subjectName: string, reason?: string): string {
    const customMsg = this.cachedGuardrails?.rejectionMessage;
    const base = customMsg
      ? customMsg
      : `عذراً، لا أستطيع الإجابة على هذا السؤال. أنا مساعد متخصص فقط في مادة "${subjectName}" ضمن منهاج التوجيهي الفلسطيني.`;
    const hint = `\n\nيمكنك أن تطلب مني:\n• توليد أسئلة تدريبية في "${subjectName}"\n• رفع ملف امتحان للحصول على أسئلة مشابهة\n• طلب أسئلة حسب الوحدة أو مستوى الصعوبة`;

    return reason ? `${base}\n\nالسبب: ${reason}${hint}` : `${base}${hint}`;
  }

  /**
   * Build the file rejection message when content doesn't match the subject.
   */
  buildFileRejectionResponse(
    subjectName: string,
    detectedSubject?: string,
    reason?: string,
  ): string {
    if (reason && reason.includes('تعذر التحقق')) {
      return `${reason}\n\nيرجى التأكد من وضوح محتوى الملف وإعادة المحاولة لمتابعة مادة "${subjectName}".`;
    }
    const customMsg = this.cachedGuardrails?.rejectionMessage;
    let msg = customMsg
      ? customMsg
      : `عذراً، محتوى الملف المرفوع غير متوافق مع مادة "${subjectName}".`;
    if (detectedSubject) {
      msg += `\nيبدو أن الملف يحتوي على محتوى يتعلق بـ "${detectedSubject}".`;
    }
    if (reason) {
      msg += `\n${reason}`;
    }
    msg += `\n\nيرجى رفع ملف يحتوي على أسئلة أو محتوى تعليمي خاص بمادة "${subjectName}".`;
    return msg;
  }
}
