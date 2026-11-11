import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BloomTaxonomyLevel,
  DifficultyLevel,
  EmbeddingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KnowledgeService } from '../../knowledge/services/knowledge.service';
import { cosineSimilarity } from '../../knowledge/services/knowledge-retrieval.service';
import {
  UploadExamDto,
  BankListDto,
  CreateBankQuestionDto,
  BulkBankActionDto,
} from '../dto';
import { QuestionUpdatedEvent } from '../events/question-updated.event';
import { QuestionApprovedEvent } from '../events/question-approved.event';
import { parseCsv, toCsv } from '../csv';

import { SUPPORTED_EXAM_MIME_TYPES } from '../../common';

export const ALLOWED_EXAM_MIME_TYPES = SUPPORTED_EXAM_MIME_TYPES;

const BANK_SELECT = {
  id: true,
  questionText: true,
  choices: true,
  correctAnswer: true,
  explanation: true,
  branchId: true,
  subjectId: true,
  year: true,
  term: true,
  difficulty: true,
  bloomTaxonomy: true,
  topicId: true,
  sourceFileId: true,
  embeddingStatus: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
  subject: { select: { name: true } },
  branch: { select: { name: true } },
} satisfies Prisma.ExamBankQuestionSelect;

const CSV_COLUMNS = [
  'questionText',
  'A',
  'B',
  'C',
  'D',
  'correctAnswer',
  'explanation',
  'year',
  'term',
  'difficulty',
  'bloomTaxonomy',
  'unit',
] as const;

@Injectable()
export class ExamBankService {
  private readonly logger = new Logger(ExamBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly knowledge: KnowledgeService,
  ) {}

  /**
   * رفع ملف امتحان. صار يمرّ بنفس خط المعالجة تبع لوحة «رفع ومعالجة
   * الملفات» (بالخيارات الافتراضية المحفوظة)، بدل طابور استخراج منفصل.
   */
  async uploadAndEnqueue(
    file: Express.Multer.File,
    dto: UploadExamDto,
    userId: string,
  ) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    if (subject.branchId !== dto.branchId) {
      throw new BadRequestException('Subject does not belong to this branch');
    }
    const job = await this.knowledge.upload(
      file,
      {
        kind: 'EXAM',
        subjectId: dto.subjectId,
        year: dto.year,
        term: dto.term,
      },
      userId,
    );
    return {
      examFileId: await this.examFileIdOf(job.id),
      documentId: job.id,
      status: 'PENDING',
    };
  }

  private async examFileIdOf(documentId: string) {
    const d = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { examFileId: true },
    });
    return d?.examFileId ?? null;
  }

  async getExamFile(id: string) {
    const examFile = await this.prisma.examFile.findUnique({
      where: { id },
      include: { stagedQuestions: true, branch: true, subject: true },
    });
    if (!examFile) throw new NotFoundException('Exam file not found');
    return examFile;
  }

  async listExamFiles(status?: string, page = 1, limit = 20) {
    const where: Prisma.ExamFileWhereInput = {};
    if (status) where.status = status as Prisma.ExamFileWhereInput['status'];

    const [data, total] = await Promise.all([
      this.prisma.examFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { branch: true, subject: true },
      }),
      this.prisma.examFile.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /* ───────── بنك الأسئلة ───────── */

  private bankWhere(q: BankListDto): Prisma.ExamBankQuestionWhereInput {
    const where: Prisma.ExamBankQuestionWhereInput = { deletedAt: null };
    if (q.subjectId) where.subjectId = q.subjectId;
    if (q.difficulty) where.difficulty = q.difficulty;
    if (q.bloomTaxonomy) where.bloomTaxonomy = q.bloomTaxonomy;
    if (q.embeddingStatus) where.embeddingStatus = q.embeddingStatus;
    if (q.q?.trim())
      where.questionText = { contains: q.q.trim(), mode: 'insensitive' };
    return where;
  }

  async listBank(q: BankListDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where = this.bankWhere(q);
    const [data, total] = await Promise.all([
      this.prisma.examBankQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: BANK_SELECT,
      }),
      this.prisma.examBankQuestion.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async bankStats() {
    const rows = await this.prisma.examBankQuestion.groupBy({
      by: ['embeddingStatus'],
      where: { deletedAt: null },
      _count: true,
    });
    const get = (s: EmbeddingStatus) =>
      rows.find((r) => r.embeddingStatus === s)?._count ?? 0;
    return {
      total: rows.reduce((n, r) => n + r._count, 0),
      indexed: get('INDEXED'),
      pending: get('PENDING'),
      failed: get('FAILED'),
    };
  }

  async createBankQuestion(dto: CreateBankQuestionDto) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    this.assertChoices(dto.choices, dto.correctAnswer);
    const created = await this.prisma.examBankQuestion.create({
      data: {
        questionText: dto.questionText,
        choices: dto.choices as unknown as Prisma.InputJsonValue,
        correctAnswer: dto.correctAnswer,
        explanation: dto.explanation,
        subjectId: subject.id,
        branchId: subject.branchId,
        year: dto.year,
        term: dto.term,
        difficulty: dto.difficulty,
        bloomTaxonomy: dto.bloomTaxonomy,
        topicId: dto.topicId,
      },
      select: BANK_SELECT,
    });
    this.eventEmitter.emit(
      'question.approved',
      new QuestionApprovedEvent(created.id),
    );
    return created;
  }

  private assertChoices(
    choices: { label: string; text: string }[],
    correct: string,
  ) {
    if (!choices?.length)
      throw new BadRequestException('At least one choice is required');
    if (!choices.some((c) => c.label === correct)) {
      throw new BadRequestException(
        'correctAnswer must match one of the choice labels',
      );
    }
  }

  async updateBankQuestion(id: string, dto: Record<string, unknown>) {
    const existing = await this.prisma.examBankQuestion.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Question not found');
    }

    // التضمين مبني على نص السؤال والشرح — تغيير أي منهم بيحتاج إعادة تضمين
    const textChanged =
      ('questionText' in dto && dto.questionText !== existing.questionText) ||
      ('explanation' in dto && dto.explanation !== existing.explanation);

    const updated = await this.prisma.examBankQuestion.update({
      where: { id },
      data: {
        ...dto,
        ...(textChanged ? { embeddingStatus: 'PENDING' } : {}),
      },
      select: BANK_SELECT,
    });

    if (textChanged) {
      this.eventEmitter.emit('question.updated', new QuestionUpdatedEvent(id));
    }
    return updated;
  }

  async softDeleteBankQuestion(id: string) {
    const existing = await this.prisma.examBankQuestion.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.examBankQuestion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Question soft-deleted' };
  }

  async getBankQuestion(id: string) {
    const question = await this.prisma.examBankQuestion.findUnique({
      where: { id },
      select: { ...BANK_SELECT, deletedAt: true },
    });
    if (!question || question.deletedAt) {
      throw new NotFoundException('Question not found');
    }
    const source = question.sourceFileId
      ? await this.prisma.examFile.findUnique({
          where: { id: question.sourceFileId },
          select: { originalName: true, year: true, term: true },
        })
      : null;
    return { ...question, source };
  }

  /** أقرب أسئلة دلالياً بنفس المادة — للكشف عن التكرار بدرج التعديل */
  async similarQuestions(id: string, limit = 3) {
    const q = await this.prisma.examBankQuestion.findUnique({
      where: { id },
      select: { subjectId: true, embedding: true },
    });
    if (!q) throw new NotFoundException('Question not found');
    if (!q.embedding.length) return [];
    const candidates = await this.prisma.examBankQuestion.findMany({
      where: {
        subjectId: q.subjectId,
        deletedAt: null,
        embeddingStatus: 'INDEXED',
        id: { not: id },
      },
      select: { id: true, questionText: true, embedding: true },
      take: 5000,
    });
    return candidates
      .map((c) => ({
        id: c.id,
        questionText: c.questionText,
        similarity: cosineSimilarity(q.embedding, c.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async bulk(dto: BulkBankActionDto) {
    const ids = dto.ids;
    switch (dto.action) {
      case 'reembed': {
        const { count } = await this.prisma.examBankQuestion.updateMany({
          where: { id: { in: ids }, deletedAt: null },
          data: { embeddingStatus: 'PENDING' },
        });
        ids.forEach((id) =>
          this.eventEmitter.emit(
            'question.updated',
            new QuestionUpdatedEvent(id),
          ),
        );
        return { affected: count };
      }
      case 'difficulty': {
        if (!dto.difficulty)
          throw new BadRequestException('difficulty is required');
        const { count } = await this.prisma.examBankQuestion.updateMany({
          where: { id: { in: ids }, deletedAt: null },
          data: { difficulty: dto.difficulty },
        });
        return { affected: count };
      }
      case 'delete': {
        const { count } = await this.prisma.examBankQuestion.updateMany({
          where: { id: { in: ids }, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        return { affected: count };
      }
    }
  }

  async exportCsv(q: BankListDto): Promise<string> {
    const rows = await this.prisma.examBankQuestion.findMany({
      where: this.bankWhere(q),
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      select: BANK_SELECT,
    });
    const header = [
      'id',
      'subject',
      'branch',
      ...CSV_COLUMNS,
      'embeddingStatus',
      'usageCount',
    ];
    const lines = rows.map((r) => {
      const choices = r.choices as { label: string; text: string }[];
      const choice = (l: string) =>
        choices.find((c) => c.label === l)?.text ?? '';
      return [
        r.id,
        r.subject.name,
        r.branch.name,
        r.questionText,
        choice('A'),
        choice('B'),
        choice('C'),
        choice('D'),
        r.correctAnswer,
        r.explanation ?? '',
        r.year,
        r.term,
        r.difficulty,
        r.bloomTaxonomy,
        r.topicId ?? '',
        r.embeddingStatus,
        r.usageCount,
      ];
    });
    return toCsv([header, ...lines]);
  }

  /**
   * استيراد CSV لمادة وحدة. الأعمدة: questionText, A..D, correctAnswer,
   * explanation, year, term, difficulty, bloomTaxonomy, unit. الصفوف
   * الغلط بترجع بأرقامها وما بتوقف باقي الملف.
   */
  async importCsv(subjectId: string, content: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    const [header, ...rows] = parseCsv(content.replace(/^\uFEFF/, ''));
    if (!header) throw new BadRequestException('Empty CSV');
    const col = (name: string) =>
      header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    const idx = Object.fromEntries(
      CSV_COLUMNS.map((c) => [c, col(c)]),
    ) as Record<(typeof CSV_COLUMNS)[number], number>;
    if (idx.questionText < 0 || idx.correctAnswer < 0) {
      throw new BadRequestException(
        'CSV must have questionText and correctAnswer columns',
      );
    }

    const errors: { row: number; message: string }[] = [];
    const data: Prisma.ExamBankQuestionCreateManyInput[] = [];
    rows.forEach((r, i) => {
      const get = (c: (typeof CSV_COLUMNS)[number]) =>
        idx[c] >= 0 ? (r[idx[c]] ?? '').trim() : '';
      const line = i + 2;
      if (!r.some((v) => v.trim())) return;
      const choices = (['A', 'B', 'C', 'D'] as const)
        .map((l) => ({ label: l, text: get(l) }))
        .filter((c) => c.text);
      const correct = get('correctAnswer').toUpperCase();
      const difficulty = (get('difficulty') || 'MEDIUM').toUpperCase();
      const bloom = (get('bloomTaxonomy') || 'UNDERSTAND').toUpperCase();
      const year = Number(get('year')) || new Date().getFullYear();
      if (!get('questionText'))
        return errors.push({ row: line, message: 'questionText is empty' });
      if (choices.length < 2)
        return errors.push({ row: line, message: 'needs at least 2 choices' });
      if (!choices.some((c) => c.label === correct))
        return errors.push({
          row: line,
          message: 'correctAnswer is not one of the choices',
        });
      if (!(difficulty in DifficultyLevel))
        return errors.push({
          row: line,
          message: `unknown difficulty "${difficulty}"`,
        });
      if (!(bloom in BloomTaxonomyLevel))
        return errors.push({
          row: line,
          message: `unknown bloomTaxonomy "${bloom}"`,
        });
      data.push({
        questionText: get('questionText'),
        choices,
        correctAnswer: correct,
        explanation: get('explanation') || null,
        subjectId: subject.id,
        branchId: subject.branchId,
        year,
        term: get('term') || 'الدورة الأولى',
        difficulty: difficulty as DifficultyLevel,
        bloomTaxonomy: bloom as BloomTaxonomyLevel,
        topicId: get('unit') || null,
      });
    });

    const created = await this.prisma.$transaction(
      data.map((d) =>
        this.prisma.examBankQuestion.create({ data: d, select: { id: true } }),
      ),
    );
    created.forEach((c) =>
      this.eventEmitter.emit(
        'question.approved',
        new QuestionApprovedEvent(c.id),
      ),
    );
    this.logger.log(
      `Imported ${created.length} bank questions into ${subject.name} (${errors.length} rejected rows)`,
    );
    return { imported: created.length, errors };
  }
}
