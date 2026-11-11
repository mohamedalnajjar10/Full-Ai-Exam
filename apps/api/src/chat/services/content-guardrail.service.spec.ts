import { ContentGuardrailService } from './content-guardrail.service';

describe('ContentGuardrailService', () => {
  let service: ContentGuardrailService;
  let mockGemini: { validateFileContent: jest.Mock };
  let mockPrisma: { appSetting: { findUnique: jest.Mock } };

  beforeEach(() => {
    mockGemini = {
      validateFileContent: jest.fn(),
    };
    mockPrisma = {
      appSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    service = new ContentGuardrailService(
      mockGemini as any,
      mockPrisma as any,
    );
  });

  it('validates file content using Gemini and parses valid result', async () => {
    mockGemini.validateFileContent.mockResolvedValue(
      JSON.stringify({
        isRelevant: true,
        detectedSubject: 'الرياضيات',
        confidence: 0.95,
        reason: 'ورقة امتحان رياضيات',
      }),
    );

    const result = await service.validateFileContent(
      Buffer.from('%PDF-1.4 sample'),
      'application/pdf',
      'الرياضيات',
      'علمي',
    );

    expect(result.isRelevant).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.detectedSubject).toBe('الرياضيات');
  });

  it('bypasses file validation when fileValidationEnabled is false in AppSetting', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'ai_guardrails',
      value: {
        fileValidationEnabled: false,
      },
    });

    const result = await service.validateFileContent(
      Buffer.from('%PDF-1.4 sample'),
      'application/pdf',
      'الرياضيات',
      'علمي',
    );

    expect(mockGemini.validateFileContent).not.toHaveBeenCalled();
    expect(result.isRelevant).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it('rejects file when confidence is below fileConfidenceThreshold in AppSetting', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'ai_guardrails',
      value: {
        fileValidationEnabled: true,
        fileConfidenceThreshold: 0.85,
      },
    });

    mockGemini.validateFileContent.mockResolvedValue(
      JSON.stringify({
        isRelevant: true,
        detectedSubject: 'الرياضيات',
        confidence: 0.78, // below 0.85
      }),
    );

    const result = await service.validateFileContent(
      Buffer.from('%PDF-1.4 sample'),
      'application/pdf',
      'الرياضيات',
      'علمي',
    );

    expect(result.isRelevant).toBe(false);
    expect(result.reason).toContain('أقل من الحد الأدنى المعتمد');
  });

  it('uses custom rejection message from AppSetting when configured', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({
      key: 'ai_guardrails',
      value: {
        rejectionMessage: 'رسالة رفض مخصصة من الإدارة للمحتوى غير المطابق',
      },
    });

    await service.getGuardrailSettings();

    const offTopicMsg = service.buildOffTopicResponse('الفيزياء');
    expect(offTopicMsg).toContain('رسالة رفض مخصصة من الإدارة للمحتوى غير المطابق');

    const fileRejectMsg = service.buildFileRejectionResponse('الفيزياء');
    expect(fileRejectMsg).toContain('رسالة رفض مخصصة من الإدارة للمحتوى غير المطابق');
  });
});
