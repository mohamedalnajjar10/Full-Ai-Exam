import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KnowledgeSourceKind, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * هيكل المنهاج للوحة التحكم: الفروع، موادها ووحداتها، والمعلمون. إنشاء
 * وتعديل المواد والمعلمين نفسه بنقاط /subjects و /teachers الموجودة؛ هون
 * النظرة المجمّعة والوحدات وإدارة الفروع.
 */
@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [branches, subjects, students, bank, books, teachers] =
      await Promise.all([
        this.prisma.branch.findMany({
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true },
        }),
        this.prisma.subject.findMany({
          orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            branchId: true,
            units: true,
            bookPdfOriginalName: true,
          },
        }),
        this.prisma.user.groupBy({
          by: ['branchId'],
          where: { role: Role.STUDENT, branchId: { not: null } },
          _count: true,
        }),
        this.prisma.examBankQuestion.groupBy({
          by: ['subjectId'],
          where: { deletedAt: null },
          _count: true,
        }),
        this.prisma.knowledgeDocument.groupBy({
          by: ['subjectId', 'stage'],
          where: { kind: KnowledgeSourceKind.BOOK },
          _count: true,
        }),
        this.prisma.teacher.findMany({
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            title: true,
            bio: true,
            imageUrl: true,
            imageKey: true,
            yearsOfExperience: true,
            isActive: true,
            displayOrder: true,
            subjectId: true,
            subject: { select: { name: true } },
          },
        }),
      ]);

    const studentsByBranch = new Map(
      students.map((s) => [s.branchId, s._count]),
    );
    const bankBySubject = new Map(bank.map((b) => [b.subjectId, b._count]));

    return {
      branches: branches.map((b) => ({
        ...b,
        students: studentsByBranch.get(b.id) ?? 0,
        subjects: subjects.filter((s) => s.branchId === b.id).length,
      })),
      subjects: subjects.map((s) => {
        const docs = books.filter((d) => d.subjectId === s.id);
        const count = (stage: string) =>
          docs.find((d) => d.stage === stage)?._count ?? 0;
        const indexed = count('INDEXED');
        const failed = count('FAILED');
        const processing = docs
          .filter((d) => !['INDEXED', 'FAILED', 'CHUNKED'].includes(d.stage))
          .reduce((n, d) => n + d._count, 0);
        return {
          id: s.id,
          name: s.name,
          branchId: s.branchId,
          units: s.units,
          bankQuestions: bankBySubject.get(s.id) ?? 0,
          students: studentsByBranch.get(s.branchId) ?? 0,
          books: {
            indexed: indexed + count('CHUNKED'),
            processing,
            failed,
            // كتاب PDF قديم مرفوع للعرض فقط (قبل قاعدة المعرفة)
            legacyPdf: s.bookPdfOriginalName,
          },
        };
      }),
      teachers: teachers.map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        bio: t.bio,
        // صورة مرفوعة بتنخدم من /teachers/:id/photo
        hasPhoto: Boolean(t.imageKey || t.imageUrl),
        yearsOfExperience: t.yearsOfExperience,
        isActive: t.isActive,
        displayOrder: t.displayOrder,
        subjectId: t.subjectId,
        subjectName: t.subject?.name ?? null,
      })),
    };
  }

  /** الوحدات بالترتيب: منظّفة، بلا فراغات ولا تكرار */
  async saveUnits(subjectId: string, units: string[]) {
    const clean = Array.from(
      new Set(units.map((u) => u.replace(/\s+/g, ' ').trim()).filter(Boolean)),
    );
    try {
      const subject = await this.prisma.subject.update({
        where: { id: subjectId },
        data: { units: clean },
        select: { id: true, units: true },
      });
      return subject;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('المادة غير موجودة.');
      }
      throw err;
    }
  }

  async renameBranch(id: string, name: string) {
    try {
      return await this.prisma.branch.update({
        where: { id },
        data: { name: name.trim() },
        select: { id: true, name: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025')
          throw new NotFoundException('الفرع غير موجود.');
        if (err.code === 'P2002')
          throw new ConflictException('يوجد فرع بهذا الاسم.');
      }
      throw err;
    }
  }

  /** حذف فرع فاضي بس — فرع فيه مواد أو طلاب بيكسر حساباتهم */
  async deleteBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { subjects: true, users: true } },
      },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود.');
    if (branch._count.subjects || branch._count.users) {
      throw new ConflictException(
        `لا يمكن حذف فرع فيه ${branch._count.subjects} مادة و${branch._count.users} مستخدم.`,
      );
    }
    await this.prisma.branch.delete({ where: { id } });
    return { id };
  }
}
