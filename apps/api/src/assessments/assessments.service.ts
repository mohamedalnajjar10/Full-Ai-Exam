import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  STUDENT_EVENTS,
  StudentActivityEventPayload,
} from '../parent/events/student-activity.events';
import {
  AssessmentAttemptStatus,
  BloomTaxonomyLevel,
  DifficultyLevel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import {
  GenerateAssessmentDto,
  SubmitAssessmentDto,
  AssessmentHistoryQueryDto,
} from './dto';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Generates a 10-question diagnostic capability assessment covering various Bloom's
   * Taxonomy levels for the requested subject and creates a PENDING attempt for the student.
   */
  async generateAssessment(studentId: string, dto: GenerateAssessmentDto) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      include: { branch: true },
    });

    if (!subject) {
      throw new NotFoundException(
        `Subject with ID "${dto.subjectId}" was not found.`,
      );
    }

    const difficulty = dto.difficultyLevel ?? DifficultyLevel.MEDIUM;
    const branchName = subject.branch?.name ? `(${subject.branch.name})` : '';

    const systemPrompt = `You are a distinguished educational assessment expert and psychometrician specializing in creating standardized student capability assessment tests for the Palestinian and Arab curricula.
Your task is to generate 5 high-quality multiple-choice questions (MCQs) to evaluate a student's cognitive capabilities, proficiency, strengths, and weaknesses in the subject "${subject.name}" ${branchName}.

TARGET DIFFICULTY LEVEL: ${difficulty}

PEDAGOGICAL & BLOOM'S TAXONOMY REQUIREMENTS:
Generate 5 questions distributed across cognitive levels (REMEMBER, UNDERSTAND, APPLY, ANALYZE, EVALUATE).

QUESTION SPECIFICATIONS:
- questionText: Clear, high-standard academic Arabic. Use LaTeX for math/chemical formulas ($...$ for inline, $$...$$ for block).
- choices: Exactly 4 choices labeled "A", "B", "C", "D".
- correctAnswer: The label of the correct choice ("A", "B", "C", or "D").
- explanation: A concise, one-sentence pedagogical justification for the correct answer (max 20 words).
- bloomTaxonomy: Exactly one of "REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE".
- Distractors must be plausible and represent common educational misconceptions.

CRITICAL OUTPUT FORMAT REQUIREMENT:
You MUST respond with ONLY a valid, parseable JSON object matching this schema without any markdown preamble or postamble:
{
  "questions": [
    {
      "questionText": "نص السؤال هنا",
      "choices": [
        { "label": "A", "text": "الخيار الأول" },
        { "label": "B", "text": "الخيار الثاني" },
        { "label": "C", "text": "الخيار الثالث" },
        { "label": "D", "text": "الخيار الرابع" }
      ],
      "correctAnswer": "A",
      "explanation": "تفسير الإجابة النموذجية هنا",
      "bloomTaxonomy": "APPLY"
    }
  ]
}`;

    this.logger.log(
      `Generating assessment questions for student "${studentId}" in subject "${subject.name}" (${subject.id})`,
    );

    const generatedQuestions = await this.gemini.generateQuestions(
      systemPrompt,
      5,
    );

    if (!generatedQuestions || generatedQuestions.length === 0) {
      throw new BadRequestException(
        'Failed to generate assessment questions from AI.',
      );
    }

    const { assessment, attempt } = await this.prisma.$transaction(
      async (tx) => {
        const createdAssessment = await tx.assessment.create({
          data: {
            title: dto.title?.trim() || `اختبار تقييم قدرات: ${subject.name}`,
            subjectId: subject.id,
            difficultyLevel: difficulty,
            questions: {
              create: generatedQuestions.map((q) => {
                const validBlooms = Object.values(BloomTaxonomyLevel);
                const bloom =
                  validBlooms.find(
                    (b) =>
                      b.toLowerCase() === q.bloomTaxonomy?.trim().toLowerCase(),
                  ) ?? BloomTaxonomyLevel.APPLY;

                return {
                  questionText: q.questionText,
                  options: q.choices,
                  correctAnswer: q.correctAnswer.trim().toUpperCase(),
                  bloomTaxonomyLevel: bloom,
                  explanation: q.explanation,
                };
              }),
            },
          },
          include: {
            questions: true,
            subject: true,
          },
        });

        const createdAttempt = await tx.assessmentAttempt.create({
          data: {
            userId: studentId,
            assessmentId: createdAssessment.id,
            status: AssessmentAttemptStatus.PENDING,
            startedAt: new Date(),
          },
        });

        return { assessment: createdAssessment, attempt: createdAttempt };
      },
    );

    // Strip correctAnswer and explanation to prevent cheating
    const sanitizedQuestions = assessment.questions.map((q) => ({
      id: q.id,
      assessmentId: q.assessmentId,
      questionText: q.questionText,
      options: q.options,
      bloomTaxonomyLevel: q.bloomTaxonomyLevel,
      createdAt: q.createdAt,
    }));

    return {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        subjectId: assessment.subjectId,
        difficultyLevel: assessment.difficultyLevel,
        subject: {
          id: assessment.subject.id,
          name: assessment.subject.name,
        },
        questions: sanitizedQuestions,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
      },
      attemptId: attempt.id,
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
      },
    };
  }

  /**
   * Retrieves details of a past or ongoing assessment attempt, including its questions.
   * If PENDING, correctAnswer and explanation are redacted to prevent cheating.
   * If COMPLETED, answers, correct answers, explanations, score, and aiFeedback are included.
   */
  async getAttempt(studentId: string, attemptId: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            subject: true,
            questions: true,
          },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Assessment attempt with ID "${attemptId}" was not found.`,
      );
    }

    if (attempt.userId !== studentId) {
      throw new ForbiddenException(
        'You do not have permission to view this assessment attempt.',
      );
    }

    const isPending = attempt.status === AssessmentAttemptStatus.PENDING;

    const sanitizedQuestions = attempt.assessment.questions.map((q) => {
      if (isPending) {
        return {
          id: q.id,
          assessmentId: q.assessmentId,
          questionText: q.questionText,
          options: q.options,
          bloomTaxonomyLevel: q.bloomTaxonomyLevel,
          createdAt: q.createdAt,
        };
      }

      return {
        id: q.id,
        assessmentId: q.assessmentId,
        questionText: q.questionText,
        options: q.options,
        bloomTaxonomyLevel: q.bloomTaxonomyLevel,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        createdAt: q.createdAt,
      };
    });

    return {
      id: attempt.id,
      userId: attempt.userId,
      assessmentId: attempt.assessmentId,
      score: attempt.score,
      status: attempt.status,
      aiFeedback: attempt.aiFeedback,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      assessment: {
        id: attempt.assessment.id,
        title: attempt.assessment.title,
        subjectId: attempt.assessment.subjectId,
        difficultyLevel: attempt.assessment.difficultyLevel,
        subject: {
          id: attempt.assessment.subject.id,
          name: attempt.assessment.subject.name,
        },
        questions: sanitizedQuestions,
        createdAt: attempt.assessment.createdAt,
        updatedAt: attempt.assessment.updatedAt,
      },
      answers: isPending
        ? []
        : attempt.answers.map((ans) => ({
            id: ans.id,
            questionId: ans.questionId,
            studentAnswer: ans.studentAnswer,
            isCorrect: ans.isCorrect,
            correctAnswer: ans.question?.correctAnswer,
            explanation: ans.question?.explanation,
            bloomTaxonomyLevel: ans.question?.bloomTaxonomyLevel,
            createdAt: ans.createdAt,
          })),
    };
  }

  /**
   * Submits answers for an ongoing assessment attempt:
   * 1. Validates that the attempt exists, belongs to the student, and is PENDING.
   * 2. Evaluates student answers against correct answers and calculates the score.
   * 3. Generates comprehensive diagnostic AI feedback focusing on strengths, weaknesses,
   *    and a personalized study plan based on Bloom's Taxonomy cognitive levels.
   * 4. Updates the attempt and persists answers inside a prisma.$transaction.
   */
  async submitAssessment(
    studentId: string,
    attemptId: string,
    dto: SubmitAssessmentDto,
  ) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            subject: true,
            questions: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Assessment attempt with ID "${attemptId}" was not found.`,
      );
    }

    if (attempt.userId !== studentId) {
      throw new ForbiddenException(
        'You do not have permission to submit this assessment attempt.',
      );
    }

    if (attempt.status === AssessmentAttemptStatus.COMPLETED) {
      throw new BadRequestException(
        'This assessment attempt has already been submitted.',
      );
    }

    const questions = attempt.assessment.questions;
    if (!questions || questions.length === 0) {
      throw new BadRequestException(
        'The assessment contains no questions to evaluate.',
      );
    }

    const studentAnswersMap = new Map<string, string>();
    for (const ans of dto.answers || []) {
      studentAnswersMap.set(ans.questionId, ans.answer?.trim() ?? '');
    }

    let correctCount = 0;
    const evaluatedAnswers = questions.map((q) => {
      const studentAnswer = studentAnswersMap.get(q.id) ?? '';
      const isCorrect =
        studentAnswer.length > 0 &&
        studentAnswer.trim().toUpperCase() ===
          q.correctAnswer.trim().toUpperCase();

      if (isCorrect) {
        correctCount++;
      }

      return {
        questionId: q.id,
        questionText: q.questionText,
        studentAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        bloomTaxonomyLevel: q.bloomTaxonomyLevel,
      };
    });

    const totalQuestions = questions.length;
    const scorePercentage =
      totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100 * 100) / 100
        : 0;

    const correctAnswers = evaluatedAnswers.filter((a) => a.isCorrect);
    const incorrectAnswers = evaluatedAnswers.filter((a) => !a.isCorrect);

    this.logger.log(
      `Evaluating attempt "${attemptId}": ${correctCount}/${totalQuestions} correct (${scorePercentage}%). Generating AI feedback...`,
    );

    const aiFeedback = await this.generateAiFeedback({
      subjectName: attempt.assessment.subject.name,
      difficultyLevel: attempt.assessment.difficultyLevel,
      totalQuestions,
      correctCount,
      scorePercentage,
      correctAnswers,
      incorrectAnswers,
    });

    const completedAt = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.assessmentAttempt.updateMany({
          where: { id: attempt.id, status: AssessmentAttemptStatus.PENDING },
          data: {
            score: scorePercentage,
            status: AssessmentAttemptStatus.COMPLETED,
            aiFeedback,
            completedAt,
          },
        });

        if (count === 0) {
          throw new BadRequestException(
            'This assessment attempt has already been submitted.',
          );
        }

        await tx.assessmentAnswer.createMany({
          data: evaluatedAnswers.map((a) => ({
            attemptId: attempt.id,
            questionId: a.questionId,
            studentAnswer: a.studentAnswer,
            isCorrect: a.isCorrect,
          })),
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This assessment attempt has already been submitted or is being processed.',
        );
      }
      throw error;
    }

    this.eventEmitter?.emit(STUDENT_EVENTS.ASSESSMENT_COMPLETED, {
      studentId,
      type: 'ASSESSMENT_COMPLETED',
      title: `إكمال اختبار تقييم قدرات: ${attempt.assessment.subject?.name ?? 'مادة دراسية'}`,
      subjectId: attempt.assessment.subjectId,
      metadata: {
        attemptId: attempt.id,
        assessmentId: attempt.assessmentId,
        score: scorePercentage,
        correctCount,
        totalQuestions,
        subjectName: attempt.assessment.subject?.name,
        difficultyLevel: attempt.assessment.difficultyLevel,
      },
    } satisfies StudentActivityEventPayload);

    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      score: scorePercentage,
      totalQuestions,
      correctCount,
      status: AssessmentAttemptStatus.COMPLETED,
      aiFeedback,
      completedAt,
      answers: evaluatedAnswers,
    };
  }

  /**
   * Retrieves a paginated list of all past assessments taken by the student.
   */
  async getHistory(studentId: string, query: AssessmentHistoryQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(50, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.AssessmentAttemptWhereInput = {
      userId: studentId,
      ...(query.subjectId && {
        assessment: { subjectId: query.subjectId },
      }),
      ...(query.status && { status: query.status }),
    };

    const [total, attempts] = await Promise.all([
      this.prisma.assessmentAttempt.count({ where }),
      this.prisma.assessmentAttempt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          assessment: {
            include: {
              subject: true,
            },
          },
        },
      }),
    ]);

    return {
      data: attempts.map((a) => ({
        id: a.id,
        assessmentId: a.assessmentId,
        title: a.assessment.title,
        subject: {
          id: a.assessment.subject.id,
          name: a.assessment.subject.name,
        },
        difficultyLevel: a.assessment.difficultyLevel,
        score: a.score,
        status: a.status,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Analyzes student answers across Bloom's Taxonomy cognitive levels and produces
   * an in-depth diagnostic report identifying strengths, weaknesses, and a personalized study plan.
   */
  private async generateAiFeedback(params: {
    subjectName: string;
    difficultyLevel: string;
    totalQuestions: number;
    correctCount: number;
    scorePercentage: number;
    correctAnswers: Array<{ bloomTaxonomyLevel: string; questionText: string }>;
    incorrectAnswers: Array<{
      bloomTaxonomyLevel: string;
      questionText: string;
      studentAnswer: string;
      correctAnswer: string;
      explanation?: string | null;
    }>;
  }): Promise<string> {
    const incorrectDetails =
      params.incorrectAnswers.length > 0
        ? params.incorrectAnswers
            .map(
              (q, i) =>
                `${i + 1}. [مستوى بلوم: ${q.bloomTaxonomyLevel}]\nالسؤال: ${q.questionText}\nإجابة الطالب: "${q.studentAnswer || 'لم يُجب'}" | الإجابة الصحيحة: "${q.correctAnswer}"\nالشرح والتوضيح: ${q.explanation ?? 'غير متوفر'}`,
            )
            .join('\n\n')
        : 'لا توجد إجابات خاطئة! أجاب الطالب على جميع الأسئلة بشكل صحيح.';

    const correctSummary =
      params.correctAnswers.length > 0
        ? params.correctAnswers
            .map(
              (c) =>
                `- مستوى ${c.bloomTaxonomyLevel}: ${c.questionText.slice(0, 100)}...`,
            )
            .join('\n')
        : 'لم يجب الطالب على أي سؤال بشكل صحيح.';

    const prompt = `أنت خبير تربوي ومستشار تقييم وتشخيص أكاديمي متخصص في تقييم قدرات الطلاب وتطوير مستواهم وفق تصنيف بلوم للأهداف التعليمية (Bloom's Revised Taxonomy).
قام طالب بإنهاء اختبار تقييم قدرات في مادة "${params.subjectName}" (مستوى الصعوبة: ${params.difficultyLevel}).

📊 إحصائيات ونتائج الاختبار:
- إجمالي الأسئلة: ${params.totalQuestions}
- عدد الإجابات الصحيحة: ${params.correctCount}
- النسبة المئوية للدرجة: ${params.scorePercentage}%

✅ الأسئلة التي أجاب عليها الطالب بشكل صحيح (المستويات المعرفية المتقنة):
${correctSummary}

❌ الأسئلة التي أخطأ فيها الطالب ومستوياتها المعرفية (مواطن الضعف وفجوات التعلم):
${incorrectDetails}

المطلوب:
قم بإعداد تقرير تشخيصي شامل ومحفز ومكتوب بلغة عربية تربوية راقية وواضحة بصيغة Markdown، مقسم إلى الأقسام الأربعة التالية بدقة:

### 1. 📊 التقييم العام ومستوى الإتقان
- تحليل عام لنتيجة الطالب (${params.scorePercentage}%) ومستواه المعرفي الإجمالي في مادة ${params.subjectName}.

### 2. 💪 نقاط القوة والمستويات المتقنة
- استخراج المهارات والمستويات المعرفية حسب هرم بلوم (تذكر، فهم، تطبيق، تحليل، تقييم، ابتكار) التي أظهر فيها الطالب تميزاً وإتقاناً.

### 3. ⚠️ نقاط الضعف وفجوات التعلم (تحليل الأخطاء)
- تفنيد الأخطاء التي وقع فيها الطالب، وتحديد المستويات المعرفية التي واجه فيها صعوبة (مثل تعثر في التطبيق الحسابي أو التحليل المنطقي).
- توضيح المفاهيم المغلوطة باختصار.

### 4. 🎯 خطة دراسية مخصصة وتوصيات عملية للتحسين
- جدول أو خطوات عملية محددة (Study Plan) تساعد الطالب على سد هذه الفجوات وتحسين مستواه في الاختبارات القادمة.
- نصائح للمراجعة الفعالة وحل المسائل.`;

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('AI feedback generation timed out')),
          10_000,
        );
      });

      const response = await Promise.race([
        this.gemini.generateContentWithFallback({
          task: 'answer',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
        timeoutPromise,
      ]);

      return (
        response.text?.trim() ||
        `تم تقييم الاختبار بنجاح بنتيجة ${params.scorePercentage}%. يُنصح بمراجعة الأسئلة التي تم الخطأ فيها والتركيز على المستويات المعرفية المرتبطة بها.`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to generate AI feedback for assessment or timed out: ${String(error)}`,
      );
      return `تم تقييم الاختبار بنجاح وحساب النتيجة (${params.scorePercentage}%). يُنصح بمراجعة الأسئلة التي تم الخطأ فيها والتركيز على مفاهيمها الأساسية.`;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
