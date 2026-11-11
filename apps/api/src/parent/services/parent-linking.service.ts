import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import { CreateParentLinkDto } from '../dto/create-parent-link.dto';
import {
  deriveVirtualEmail,
  generateFamilyPin,
  generateMagicToken,
  hashMagicToken,
  maskPhoneNumber,
  normalizePhoneNumber,
} from '../../auth/utils/parent-crypto.util';
import { BCRYPT_SALT_ROUNDS } from '../../auth/constant/auth-messages';
import { getFrontendUrl } from '../../auth/utils/app-urls.util';

export interface ParentLinkResponse {
  linkId: string;
  parentId: string;
  parentName: string;
  parentPhone: string;
  pin: string;
  magicToken: string;
  magicLoginLink: string;
  whatsappLink: string;
  whatsappLink970: string;
  whatsappLink972: string;
  qrData: string;
  qrDataUrl: string;
  expiresAt: Date;
}

@Injectable()
export class ParentLinkingService {
  private readonly logger = new Logger(ParentLinkingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates or refreshes a student-parent link.
   * Enforces IDOR protection: only the authenticated student can initiate this link.
   * Generates a 6-digit PIN and a 32-byte magic token.
   */
  async createLink(
    studentId: string,
    dto: CreateParentLinkDto,
  ): Promise<ParentLinkResponse> {
    const normalizedPhone = normalizePhoneNumber(dto.parentPhone);
    const virtualEmail = deriveVirtualEmail(normalizedPhone);
    const trimmedParentName = dto.parentName.trim();

    // 1. Retrieve the student account to prevent self-linking and verify state
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!student) {
      throw new BadRequestException('Student account not found');
    }

    if (student.role !== Role.STUDENT) {
      throw new BadRequestException(
        'Only students are authorized to generate parent links',
      );
    }

    // IDOR / Business Rule check: Student cannot link their own contact details
    if (student.email.toLowerCase() === virtualEmail.toLowerCase()) {
      throw new BadRequestException(
        'Student cannot register their own phone number as their parent',
      );
    }

    // 2. Find or create the parent User account atomically
    let parentUser = await this.prisma.user.findUnique({
      where: { email: virtualEmail },
    });

    if (parentUser) {
      // Ensure the existing account has the PARENT role
      if (parentUser.role !== Role.PARENT) {
        throw new ConflictException(
          'This phone number is already registered under an existing staff or student account',
        );
      }

      // Check if student is trying to link themselves by ID
      if (parentUser.id === student.id) {
        throw new BadRequestException('Cannot link an account to itself');
      }

      // If the parent already exists, only set name if it was not previously set.
      // An unverified student invitation MUST NOT overwrite an existing parent's profile name.
      if (trimmedParentName && !parentUser.name) {
        parentUser = await this.prisma.user.update({
          where: { id: parentUser.id },
          data: { name: trimmedParentName },
        });
      }
    } else {
      // Create new virtual User account for the parent
      parentUser = await this.prisma.user.create({
        data: {
          email: virtualEmail,
          name: trimmedParentName,
          role: Role.PARENT,
          emailVerified: true, // Virtual email does not require outbound confirmation
        },
      });
      this.logger.log(`Created new parent account: ${parentUser.id}`);
    }

    // 3. Generate cryptographic credentials:
    // - 6-digit family PIN
    // - 32-byte (64-hex) high-entropy magicToken
    const pin = generateFamilyPin();
    const magicToken = generateMagicToken();
    const pinHash = await bcrypt.hash(pin, BCRYPT_SALT_ROUNDS);
    const magicTokenHash = hashMagicToken(magicToken);

    // Magic token validity: 30 days
    const magicTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 4. Create or update ParentStudentLink record
    // SEC-01 Fix: Check if this link was already ACTIVE.
    // If it's a new invitation or was PENDING/REVOKED, set status to PENDING.
    // Only existing ACTIVE links keep their ACTIVE status upon credential refresh.
    const existingLink = await this.prisma.parentStudentLink.findUnique({
      where: {
        studentId_parentId: {
          studentId: student.id,
          parentId: parentUser.id,
        },
      },
    });

    if (existingLink?.status === 'ACTIVE') {
      throw new ConflictException(
        'This parent is already linked to your account',
      );
    }
    const targetStatus = 'PENDING';

    const link = await this.prisma.parentStudentLink.upsert({
      where: {
        studentId_parentId: {
          studentId: student.id,
          parentId: parentUser.id,
        },
      },
      create: {
        studentId: student.id,
        parentId: parentUser.id,
        parentPhone: normalizedPhone,
        pinHash,
        magicTokenHash,
        magicTokenExpiresAt,
        status: targetStatus,
      },
      update: {
        parentPhone: normalizedPhone,
        pinHash,
        magicTokenHash,
        magicTokenExpiresAt,
        status: targetStatus,
      },
    });

    // 5. Track student activity event
    await this.prisma.studentActivityEvent
      .create({
        data: {
          studentId: student.id,
          eventType: 'PARENT_LINKED',
          title: 'تم ربط حساب ولي الأمر',
          metadata: {
            parentId: parentUser.id,
            parentName: parentUser.name,
            parentPhone: maskPhoneNumber(normalizedPhone),
          },
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to record StudentActivityEvent for student ${student.id}: ${err.message}`,
        );
      });

    // 6. Format sharing payloads (WhatsApp link, Magic link, QR Code data)
    const frontendBaseUrl = getFrontendUrl(this.configService);
    const magicLoginPath = `/parent/magic-login?token=${magicToken}`;
    const magicLoginUrl = `${frontendBaseUrl}${magicLoginPath}`;

    // Standardized WhatsApp direct links (supporting both +970 and +972 Palestinian WhatsApp accounts)
    const digitsOnly = normalizedPhone.replace(/\D/g, '');
    const nationalDigits = digitsOnly.replace(/^(970|972)/, '');
    const studentDisplayName = student.name
      ? `ابنكم/ابنتكم ${student.name}`
      : 'ابنكم/ابنتكم';
    const whatsappText =
      `مرحباً، يمكنك متابعة الأداء الدراسي والتقييمات الخاصة بـ (${studentDisplayName}) على منصة مسار التميز.\n\n` +
      `🔗 رابط الدخول السريع المباشر:\n${magicLoginUrl}\n\n` +
      `🔑 أو بالدخول برقم الهاتف ورمز العائلة المكون من 6 أرقام:\nرمز الدخول: ${pin}`;

    const encodedText = encodeURIComponent(whatsappText);
    const whatsappLink970 = `https://wa.me/970${nationalDigits}?text=${encodedText}`;
    const whatsappLink972 = `https://wa.me/972${nationalDigits}?text=${encodedText}`;

    return {
      linkId: link.id,
      parentId: parentUser.id,
      parentName: parentUser.name ?? trimmedParentName,
      parentPhone: normalizedPhone,
      pin,
      magicToken,
      magicLoginLink: magicLoginUrl,
      whatsappLink: whatsappLink970, // Default to official +970
      whatsappLink970,
      whatsappLink972,
      qrData: magicToken, // High entropy token payload for in-app scanner
      qrDataUrl: magicLoginUrl, // Direct URL for phone native camera scanner
      expiresAt: magicTokenExpiresAt,
    };
  }

  /**
   * Retrieves paginated activity timeline of a linked student for the parent.
   * Strictly enforces that the requesting parent has an ACTIVE link with the student.
   */
  async getChildTimeline(
    parentId: string,
    studentId: string,
    options: { page?: number; limit?: number; eventType?: string },
  ) {
    const activeLink = await this.prisma.parentStudentLink.findFirst({
      where: {
        parentId,
        studentId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    if (!activeLink) {
      throw new ForbiddenException(
        'لا تملك صلاحية الوصول إلى سجل نشاط هذا الطالب أو أن رابط المتابعة غير نشط.',
      );
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(50, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.StudentActivityEventWhereInput = {
      studentId,
      ...(options.eventType ? { eventType: options.eventType } : {}),
    };

    const [total, events] = await Promise.all([
      this.prisma.studentActivityEvent.count({ where }),
      this.prisma.studentActivityEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      student: activeLink.student,
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves all actively linked students for a parent, including their academic overview
   * and live summary statistics (completed assessments, average score, last activity).
   */
  async getLinkedChildren(parentId: string) {
    const links = await this.prisma.parentStudentLink.findMany({
      where: {
        parentId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            branch: {
              select: { id: true, name: true },
            },
            lastActiveAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const childrenWithStats = await Promise.all(
      links.map(async (link) => {
        const student = link.student;

        const [assessmentsAgg, totalActivities, lastActivity, latestQuizEvent] =
          await Promise.all([
            this.prisma.assessmentAttempt.aggregate({
              where: {
                userId: student.id,
                status: 'COMPLETED',
              },
              _count: { id: true },
              _avg: { score: true },
              _max: { score: true },
            }),
            this.prisma.studentActivityEvent.count({
              where: {
                studentId: student.id,
                eventType: { not: 'PARENT_LINKED' },
              },
            }),
            this.prisma.studentActivityEvent.findFirst({
              where: {
                studentId: student.id,
                eventType: { not: 'PARENT_LINKED' },
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true, title: true, eventType: true },
            }),
            this.prisma.studentActivityEvent.findFirst({
              where: { studentId: student.id, eventType: 'QUIZ_COMPLETED' },
              orderBy: { createdAt: 'desc' },
              select: { metadata: true },
            }),
          ]);

        const quizScore =
          latestQuizEvent?.metadata &&
          typeof (latestQuizEvent.metadata as any).score === 'number'
            ? (latestQuizEvent.metadata as any).score
            : null;

        const effectiveAverageScore =
          assessmentsAgg._avg.score !== null
            ? Math.round(assessmentsAgg._avg.score)
            : quizScore !== null
              ? quizScore
              : 0;

        const effectiveBestScore =
          assessmentsAgg._max.score !== null
            ? Math.round(assessmentsAgg._max.score)
            : quizScore !== null
              ? quizScore
              : 0;

        return {
          linkId: link.id,
          studentId: student.id,
          name: student.name || 'طالب',
          email: student.email,
          avatar: student.avatar,
          branchName: student.branch?.name ?? 'الفرع العام',
          stats: {
            completedAssessments: assessmentsAgg._count.id ?? 0,
            averageScore: effectiveAverageScore,
            bestScore: effectiveBestScore,
            totalActivities,
            lastActiveAt:
              lastActivity?.createdAt ?? student.lastActiveAt ?? null,
            lastActivityTitle: lastActivity?.title ?? null,
          },
        };
      }),
    );

    return { children: childrenWithStats };
  }

  /**
   * Retrieves comprehensive AI-driven insights for a linked child:
   * - AI pedagogical daily recommendation with strength and focus points
   * - Student capabilities map across subjects (Bloom taxonomy levels)
   * - High-priority instant notifications for the parent
   */
  async getChildOverview(parentId: string, studentId: string) {
    const activeLink = await this.prisma.parentStudentLink.findFirst({
      where: {
        parentId,
        studentId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            branch: { select: { id: true, name: true } },
            lastActiveAt: true,
          },
        },
      },
    });

    if (!activeLink) {
      throw new ForbiddenException(
        'لا تملك صلاحية الوصول إلى بيانات هذا الطالب أو أن رابط المتابعة غير نشط.',
      );
    }

    const student = activeLink.student;
    const studentFirstName = student.name
      ? student.name.split(' ')[0]
      : 'الطالب';

    // 0. Compute Today's Real Student KPI Metrics
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      todayEvents,
      earliestTodayEvent,
      todayAttempts,
      todayGeneratedQuestions,
      allCompletedAttempts,
      quizEvents,
    ] = await Promise.all([
      // Activities today (excluding administrative events like PARENT_LINKED)
      this.prisma.studentActivityEvent.count({
        where: {
          studentId,
          eventType: { not: 'PARENT_LINKED' },
          createdAt: { gte: todayStart },
        },
      }),
      // Earliest study activity today
      this.prisma.studentActivityEvent.findFirst({
        where: {
          studentId,
          eventType: { not: 'PARENT_LINKED' },
          createdAt: { gte: todayStart },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Assessment attempts completed today
      this.prisma.assessmentAttempt.findMany({
        where: {
          userId: studentId,
          status: 'COMPLETED',
          completedAt: { gte: todayStart },
        },
        include: {
          answers: { select: { isCorrect: true } },
        },
      }),
      // Questions generated today
      this.prisma.generatedQuestion.count({
        where: {
          studentId,
          createdAt: { gte: todayStart },
        },
      }),
      // Recent completed attempts for cognitive indicator (capped to 50 to prevent unbounded memory bloat)
      this.prisma.assessmentAttempt.findMany({
        where: {
          userId: studentId,
          status: 'COMPLETED',
        },
        select: { score: true },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      // Quiz completed events
      this.prisma.studentActivityEvent.findMany({
        where: {
          studentId,
          eventType: 'QUIZ_COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    // Card 1: Activities & start time
    const totalActivitiesToday = todayEvents;
    let startedStudyingTimeStr = 'لم يبدأ الدراسة اليوم بعد';
    if (earliestTodayEvent) {
      const timeStr = earliestTodayEvent.createdAt.toLocaleTimeString('ar-EG', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      startedStudyingTimeStr = `بدأ الدراسة الساعة ${timeStr}`;
    } else if (student.lastActiveAt) {
      const timeStr = student.lastActiveAt.toLocaleTimeString('ar-EG', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      startedStudyingTimeStr = `آخر نشاط الساعة ${timeStr}`;
    }

    // Card 2: Questions solved today & accuracy
    let answersCountToday = 0;
    let correctAnswersCountToday = 0;
    for (const att of todayAttempts) {
      answersCountToday += att.answers.length;
      correctAnswersCountToday += att.answers.filter((a) => a.isCorrect).length;
    }
    // Include today's interactive quiz questions
    const todayQuizEvents = quizEvents.filter(
      (q) => new Date(q.createdAt) >= todayStart,
    );
    for (const qe of todayQuizEvents) {
      const meta = (qe.metadata ?? {}) as Record<string, any>;
      const tot = typeof meta.total === 'number' ? meta.total : 0;
      const corr = typeof meta.correct === 'number' ? meta.correct : 0;
      answersCountToday += tot;
      correctAnswersCountToday += corr;
    }

    const allQuizScores = quizEvents
      .map((q) => (q.metadata as any)?.score)
      .filter((s): s is number => typeof s === 'number');

    const accuracyRateToday =
      answersCountToday > 0
        ? Math.round((correctAnswersCountToday / answersCountToday) * 100)
        : 0;

    // Card 3: Cognitive capability index
    const combinedScores = [
      ...allCompletedAttempts.map((a) => a.score ?? 0),
      ...allQuizScores,
    ];
    const totalAssessmentsCount = combinedScores.length;
    const cognitiveScore =
      totalAssessmentsCount > 0
        ? Math.round(
            combinedScores.reduce((acc, curr) => acc + curr, 0) /
              totalAssessmentsCount,
          )
        : 0;

    let cognitiveLevel = 'قيد التقييم';
    if (totalAssessmentsCount > 0) {
      if (cognitiveScore >= 85) cognitiveLevel = 'متقدم جداً';
      else if (cognitiveScore >= 75) cognitiveLevel = 'متقدم';
      else if (cognitiveScore >= 60) cognitiveLevel = 'جيد';
      else cognitiveLevel = 'يحتاج متابعة';
    }

    // Card 4: Daily Plan goals achieved
    let dailyPlanDoneTasks = 0;
    if (totalActivitiesToday >= 1) dailyPlanDoneTasks++;
    if (todayAttempts.length >= 1 || todayQuizEvents.length >= 1)
      dailyPlanDoneTasks++;
    if (answersCountToday >= 10) dailyPlanDoneTasks++;
    if (totalActivitiesToday >= 3) dailyPlanDoneTasks++;
    if (answersCountToday > 0 && accuracyRateToday >= 70) dailyPlanDoneTasks++;
    const dailyPlanTotalTasks = 5;

    const todayKpis = {
      activitiesCount: totalActivitiesToday,
      studyStartTime: startedStudyingTimeStr,
      hasStartedToday: !!earliestTodayEvent,
      questionsSolved: answersCountToday,
      questionsGenerated: todayGeneratedQuestions,
      accuracyRate: accuracyRateToday,
      cognitiveScore,
      cognitiveLevel,
      assessmentsCount: totalAssessmentsCount,
      planDoneTasks: dailyPlanDoneTasks,
      planTotalTasks: dailyPlanTotalTasks,
      planProgressPercentage:
        dailyPlanTotalTasks > 0
          ? Math.round((dailyPlanDoneTasks / dailyPlanTotalTasks) * 100)
          : 0,
    };

    // 1. Fetch completed assessment attempts
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        userId: studentId,
        status: 'COMPLETED',
      },
      include: {
        assessment: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });

    // 2. Fetch recent student activity events
    const recentEvents = await this.prisma.studentActivityEvent.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 3. Compute subject capabilities
    const subjectMap = new Map<
      string,
      {
        subjectId: string;
        subjectName: string;
        scores: number[];
        latestScore: number;
        attemptsCount: number;
      }
    >();

    for (const att of attempts) {
      const sub = att.assessment.subject;
      if (!sub) continue;
      const score = att.score ?? 0;
      const existing = subjectMap.get(sub.id);
      if (existing) {
        existing.scores.push(score);
        existing.attemptsCount++;
      } else {
        subjectMap.set(sub.id, {
          subjectId: sub.id,
          subjectName: sub.name,
          scores: [score],
          latestScore: score,
          attemptsCount: 1,
        });
      }
    }

    // Incorporate quiz events into subject map
    for (const qe of quizEvents) {
      const meta = (qe.metadata ?? {}) as Record<string, any>;
      const subId = meta.subjectId;
      const subName = meta.subjectName;
      const score = typeof meta.score === 'number' ? meta.score : 0;
      if (!subId || !subName) continue;

      const existing = subjectMap.get(subId);
      if (existing) {
        existing.scores.push(score);
        existing.attemptsCount++;
      } else {
        subjectMap.set(subId, {
          subjectId: subId,
          subjectName: subName,
          scores: [score],
          latestScore: score,
          attemptsCount: 1,
        });
      }
    }

    const subjectCapabilities = Array.from(subjectMap.values()).map((s) => {
      const avg = Math.round(
        s.scores.reduce((a, b) => a + b, 0) / s.scores.length,
      );
      const best = Math.max(...s.scores);
      let level: 'متقدم' | 'جيد جداً' | 'متوسط' | 'يحتاج متابعة' = 'متوسط';
      if (best >= 85) level = 'متقدم';
      else if (best >= 75) level = 'جيد جداً';
      else if (best < 60) level = 'يحتاج متابعة';

      return {
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        score: avg,
        bestScore: best,
        latestScore: s.latestScore,
        level,
        bloomTaxonomy: 'الفهم والتطبيق والتحليل',
        attemptsCount: s.attemptsCount,
      };
    });

    // 4. Generate AI pedagogical recommendation (returns null if no academic capabilities data)
    let aiRecommendation: {
      greeting: string;
      quote: string;
      strengthPoint: { subject: string; topic: string } | null;
      focusPoint: { subject: string; topic: string } | null;
      updatedAt: Date;
    } | null = null;

    if (subjectCapabilities.length > 0) {
      const sorted = [...subjectCapabilities].sort((a, b) => b.score - a.score);
      const topSubject = sorted[0];
      const lowestSubject = sorted[sorted.length - 1];

      let quote: string;
      const parentTitle = `ولي أمر ${studentFirstName}`;
      let strengthPoint: { subject: string; topic: string } | null = null;
      let focusPoint: { subject: string; topic: string } | null = null;

      if (sorted.length === 1) {
        quote =
          topSubject.score >= 70
            ? `«${parentTitle}، أظهر ${studentFirstName} أداءً جيداً في مادة ${topSubject.subjectName} بنسبة (${topSubject.score}%).»`
            : `«${parentTitle}، يُنصح بتكثيف التدريب والمراجعة في مادة ${topSubject.subjectName} حيث النسبة الحالية (${topSubject.score}%).»`;

        if (topSubject.score >= 70) {
          strengthPoint = {
            subject: topSubject.subjectName.split(' ')[0],
            topic: topSubject.score >= 80 ? 'إتقان متقدم' : 'المفاهيم الأساسية',
          };
        } else {
          focusPoint = {
            subject: topSubject.subjectName.split(' ')[0],
            topic: 'تحتاج تعزيز ومراجعة',
          };
        }
      } else {
        quote = `«${parentTitle}، أظهر ${studentFirstName} أداءً متميزاً في مادة ${topSubject.subjectName} (${topSubject.score}%)، بينما يُنصح بتركيز المراجعة في مادة ${lowestSubject.subjectName} (${lowestSubject.score}%).»`;
        strengthPoint = {
          subject: topSubject.subjectName.split(' ')[0],
          topic: topSubject.score >= 80 ? 'إتقان متقدم' : 'المفاهيم الأساسية',
        };
        focusPoint = {
          subject: lowestSubject.subjectName.split(' ')[0],
          topic: lowestSubject.score < 60 ? 'تحتاج تعزيز' : 'المسائل التطبيقية',
        };
      }

      aiRecommendation = {
        greeting: parentTitle,
        quote,
        strengthPoint,
        focusPoint,
        updatedAt: new Date(),
      };
    }

    // 5. Generate Instant Notifications from real events
    const notifications = recentEvents.map((evt) => {
      const meta = (evt.metadata ?? {}) as Record<string, any>;
      let iconType: 'ACHIEVEMENT' | 'ALERT' | 'ACTIVITY' = 'ACTIVITY';
      let title = evt.title;
      let body = `تم تسجيل النشاط في نظام مسار التميز.`;

      if (evt.eventType === 'ASSESSMENT_COMPLETED') {
        const score = meta.score ?? 0;
        if (score >= 80) {
          iconType = 'ACHIEVEMENT';
          title = `🎉 إنجاز ممتاز في اختبار قدرات ${meta.subjectName ?? ''} (${score}%)`;
          body = `أنهى ${studentFirstName} اختبار القدرات بمستوى متقدم.`;
        } else if (score < 60) {
          iconType = 'ALERT';
          title = `⚠️ تنبيه: درجة منخفضة في كويز ${meta.subjectName ?? ''} (${score}%)`;
          body = `يحتاج ${studentFirstName} لمراجعة المفاهيم والأسئلة الأساسية.`;
        } else {
          title = `📝 إنهاء تقييم في ${meta.subjectName ?? 'مادة دراسية'} (${score}%)`;
          body = `تم إكمال الاختبار بنجاح وحفظ النتائج.`;
        }
      } else if (evt.eventType === 'QUIZ_COMPLETED') {
        const score = meta.score ?? 0;
        const isRetake = Boolean(meta.isRetake);
        const isImprovement = Boolean(meta.isImprovement);
        if (isRetake && isImprovement) {
          iconType = 'ACHIEVEMENT';
          title = `🚀 قفزة في الأداء: أحرز ${studentFirstName} ${score}% عند إعادة كويز ${meta.subjectName ?? ''}`;
          body = `أعاد الطالب الكويز بعد مراجعة أخطائه وحقق نتيجة أعلى (${score}% بدلاً من ${meta.previousScore ?? 0}%).`;
        } else if (score >= 80) {
          iconType = 'ACHIEVEMENT';
          title = `🎉 إنجاز متميز: كويز ${meta.subjectName ?? ''} بنسبة ${score}%`;
          body = `أتم الطالب كويزاً تفاعلياً وأظهر تمكناً كبيراً من المفاهيم المطلوبة.`;
        } else if (score < 60) {
          iconType = 'ALERT';
          title = `⚠️ يحتاج متابعة: كويز ${meta.subjectName ?? ''} بنسبة ${score}%`;
          body = `واجه الطالب بعض الصعوبات في كويز ${meta.subjectName ?? ''}. يُنصح بمراجعة الأسئلة الخاطئة.`;
        } else {
          iconType = 'ACTIVITY';
          title = `📝 إتمام كويز تفاعلي في ${meta.subjectName ?? ''} (${score}%)`;
          body = `أنهى الطالب كويزاً تفاعلياً وراجع الشروحات المرفقة لكل إجابة.`;
        }
      } else if (evt.eventType === 'QUESTIONS_GENERATED') {
        iconType = 'ACTIVITY';
        title = `🤖 جلسة مذاكرة نشطة مع مسار التميز AI`;
        body = `قام ${studentFirstName} بتوليد ${meta.count ?? 5} أسئلة تدريبية في مادة ${meta.subjectName ?? 'الرياضيات'}.`;
      } else if (evt.eventType === 'CHAT_FILE_UPLOADED') {
        iconType = 'ACTIVITY';
        title = `📄 رفع ملف محاكاة دراسي`;
        body = `قام ${studentFirstName} برفع ملف ${meta.fileName ?? 'امتحان'} وتم توليد أسئلة مطابقة.`;
      }

      return {
        id: evt.id,
        eventType: evt.eventType,
        iconType,
        title,
        body,
        createdAt: evt.createdAt,
        read: false,
      };
    });

    return {
      student,
      todayKpis,
      aiRecommendation,
      subjectCapabilities,
      notifications,
    };
  }

  /**
   * SEC-01: Allows an authenticated parent to activate a pending link using a 6-digit PIN.
   */
  async linkStudentByPin(parentId: string, pin: string) {
    const rawPin = pin?.trim();
    if (!rawPin || !/^\d{6}$/.test(rawPin)) {
      throw new BadRequestException('رمز الربط (PIN) يجب أن يتكون من 6 أرقام');
    }

    const pendingLinks = await this.prisma.parentStudentLink.findMany({
      where: {
        parentId,
        status: 'PENDING',
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    let matchedLink: (typeof pendingLinks)[0] | null = null;
    for (const link of pendingLinks) {
      const isMatch = await bcrypt.compare(rawPin, link.pinHash);
      if (isMatch && !matchedLink) {
        matchedLink = link;
      }
    }

    if (!matchedLink) {
      throw new BadRequestException('رمز الربط غير صحيح أو منتهي الصلاحية');
    }

    await this.prisma.parentStudentLink.update({
      where: { id: matchedLink.id },
      data: { status: 'ACTIVE' },
    });

    return {
      success: true,
      message: `تم ربط حساب الطالب (${matchedLink.student.name || 'طالب'}) بنجاح`,
      student: matchedLink.student,
    };
  }

  /**
   * SEC-01: Allows an authenticated parent to activate a pending link by scanning student's QR code.
   */
  async linkStudentByQr(parentId: string, magicToken: string) {
    const rawToken = magicToken?.trim();
    if (!rawToken) {
      throw new BadRequestException('رمز الاستجابة السريع غير صالح');
    }
    const tokenHash = hashMagicToken(rawToken);

    const link = await this.prisma.parentStudentLink.findFirst({
      where: {
        parentId,
        magicTokenHash: tokenHash,
        status: 'PENDING',
      },
      include: {
        student: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!link) {
      throw new BadRequestException('رمز الربط غير صالح أو تم استخدامه مسبقاً');
    }

    if (link.magicTokenExpiresAt && link.magicTokenExpiresAt < new Date()) {
      throw new BadRequestException('انتهت صلاحية رمز الربط');
    }

    await this.prisma.parentStudentLink.update({
      where: { id: link.id },
      data: {
        status: 'ACTIVE',
        magicTokenHash: null,
        magicTokenExpiresAt: null,
      },
    });

    return {
      success: true,
      message: `تم ربط حساب الطالب (${link.student.name || 'طالب'}) بنجاح`,
      student: link.student,
    };
  }
}
