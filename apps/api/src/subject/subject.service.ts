import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { KnowledgeService } from '../knowledge/services/knowledge.service';
import { CreateSubjectDto, UpdateSubjectDto, SubjectQueryDto } from './dto';
import { decodeUploadName } from '../common';
import { clearSubjectResolverCache } from './utils/subject-resolver.util';

@Injectable()
export class SubjectService {
  private readonly logger = new Logger(SubjectService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @Optional() private knowledgeService?: KnowledgeService,
  ) {}

  // ── CRUD Operations ────────────────────────────────────────

  /**
   * Create a new subject within a specific branch.
   */
  async create(dto: CreateSubjectDto) {
    const trimmedName = dto.name.trim();

    // Verify branch exists
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID '${dto.branchId}' not found`);
    }

    // Check unique constraint (name + branchId)
    const existing = await this.prisma.subject.findUnique({
      where: {
        name_branchId: {
          name: trimmedName,
          branchId: dto.branchId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A subject with the name '${trimmedName}' already exists in this branch`,
      );
    }

    const created = await this.prisma.subject.create({
      data: {
        name: trimmedName,
        branchId: dto.branchId,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    clearSubjectResolverCache();
    return created;
  }

  /**
   * Retrieve all subjects with optional filtering by branch and search keyword.
   */
  async findAll(query?: SubjectQueryDto) {
    const where: Prisma.SubjectWhereInput = {};

    if (query?.branchId) {
      where.branchId = query.branchId;
    }

    if (query?.search) {
      const search = query.search.trim();
      where.name = { contains: search, mode: 'insensitive' };
    }

    return this.prisma.subject.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        branch: { select: { id: true, name: true } },
        _count: {
          select: {
            teachers: true,
            examFiles: true,
            examBankQuestions: true,
          },
        },
      },
    });
  }

  /**
   * Alias for findAll, optionally filtering by branch ID.
   */
  async getAll(branchId?: string) {
    return this.findAll({ branchId });
  }

  /**
   * Find a single subject by ID, including its branch, teachers, and related entity counts.
   */
  async findOne(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        teachers: {
          select: {
            id: true,
            name: true,
            title: true,
            imageUrl: true,
          },
        },
        _count: {
          select: {
            teachers: true,
            examFiles: true,
            examBankQuestions: true,
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException(`Subject with ID '${id}' not found`);
    }

    return subject;
  }

  /**
   * Alias for findOne by ID.
   */
  async getById(id: string) {
    return this.findOne(id);
  }

  /**
   * Update an existing subject's name and/or branch.
   */
  async update(id: string, dto: UpdateSubjectDto) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
    });
    if (!subject) {
      throw new NotFoundException(`Subject with ID '${id}' not found`);
    }

    // If changing branch, verify that the new branch exists
    if (dto.branchId && dto.branchId !== subject.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException(
          `Branch with ID '${dto.branchId}' not found`,
        );
      }
    }

    const targetName = dto.name !== undefined ? dto.name.trim() : subject.name;
    const targetBranchId =
      dto.branchId !== undefined ? dto.branchId : subject.branchId;

    // Check unique constraint if name or branch changed
    if (targetName !== subject.name || targetBranchId !== subject.branchId) {
      const existing = await this.prisma.subject.findUnique({
        where: {
          name_branchId: {
            name: targetName,
            branchId: targetBranchId,
          },
        },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `A subject with the name '${targetName}' already exists in this branch`,
        );
      }
    }

    const updated = await this.prisma.subject.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? targetName : undefined,
        branchId: dto.branchId !== undefined ? dto.branchId : undefined,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
    clearSubjectResolverCache();
    return updated;
  }

  /**
   * Delete a subject by ID and clean up any associated book PDF from storage.
   */
  async remove(id: string): Promise<{ message: string }> {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
    });
    if (!subject) {
      throw new NotFoundException(`Subject with ID '${id}' not found`);
    }

    // Clean up uploaded book PDF if one exists
    if (subject.bookPdfKey) {
      try {
        await this.storage.deleteFile(subject.bookPdfKey);
        this.logger.log(
          `Deleted book PDF for subject ${id}: ${subject.bookPdfKey}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to delete book PDF ${subject.bookPdfKey} on subject removal`,
          err,
        );
      }
    }

    try {
      await this.prisma.subject.delete({ where: { id } });
      clearSubjectResolverCache();
      return { message: `Subject '${subject.name}' deleted successfully` };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Cannot delete subject because it has related data (exams, questions, or teachers)',
        );
      }
      throw error;
    }
  }

  /**
   * Alias for remove.
   */
  async delete(id: string) {
    return this.remove(id);
  }

  // ── Branch & User Queries ──────────────────────────────────

  async getByBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const subjects = await this.prisma.subject.findMany({
      where: { branchId },
      orderBy: { name: 'asc' },
    });

    return subjects.map((s) => ({
      ...s,
      hasBook: Boolean(s.bookPdfKey),
    }));
  }

  async getByUserBranch(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true },
    });

    if (!user || !user.branchId) {
      throw new NotFoundException('User has no branch selected');
    }

    const subjects = await this.prisma.subject.findMany({
      where: { branchId: user.branchId },
      orderBy: { name: 'asc' },
    });

    return subjects.map((s) => ({
      ...s,
      hasBook: Boolean(s.bookPdfKey),
    }));
  }

  // ── Book PDF Management ────────────────────────────────────

  /**
   * Upload (or replace) the PDF book for a subject.
   * Stores the file under `books/{subjectId}/book.pdf` in S3/storage.
   */
  async uploadBookPdf(
    subjectId: string,
    file: Express.Multer.File,
    userId?: string,
  ) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    if (this.knowledgeService) {
      // 1. Clean up old book documents, chunks, and storage via KnowledgeService
      await this.knowledgeService.removeSubjectBooks(subjectId);

      // 2. Upload and enqueue processing job via KnowledgeService
      const effectiveUserId =
        userId ||
        (await this.prisma.user.findFirst({ select: { id: true } }))?.id ||
        'system';

      const job = await this.knowledgeService.upload(
        file,
        { kind: 'BOOK', subjectId },
        effectiveUserId,
      );

      const updated = await this.prisma.subject.findUnique({
        where: { id: subjectId },
      });

      this.logger.log(
        `Uploaded and queued book PDF for subject ${subjectId} via KnowledgeService (docId: ${job.id})`,
      );

      return {
        message: 'Book PDF uploaded successfully',
        subject: {
          id: updated!.id,
          name: updated!.name,
          bookPdfOriginalName: updated!.bookPdfOriginalName,
          bookPdfSize: updated!.bookPdfSize,
          hasBook: true,
        },
        job,
      };
    }

    // Fallback when KnowledgeService is not injected (e.g. unit tests without KnowledgeModule)
    if (subject.bookPdfKey) {
      try {
        await this.storage.deleteFile(subject.bookPdfKey);
        this.logger.log(`Deleted old book PDF: ${subject.bookPdfKey}`);
      } catch (err) {
        this.logger.warn(
          `Failed to delete old book PDF: ${subject.bookPdfKey}`,
          err,
        );
      }
    }

    const s3Key = `books/${subjectId}/book.pdf`;
    const originalName = decodeUploadName(file.originalname);
    await this.storage.uploadFile(
      s3Key,
      file.buffer,
      file.mimetype || 'application/pdf',
    );

    const updated = await this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        bookPdfKey: s3Key,
        bookPdfOriginalName: originalName,
        bookPdfSize: file.size,
      },
    });

    // Remove any stale KnowledgeDocument rows for this subject so old chunks/embeddings are purged
    try {
      await this.prisma.knowledgeDocument.deleteMany({
        where: { subjectId, kind: 'BOOK' },
      });
    } catch (syncErr) {
      this.logger.warn(
        `Failed to clean up stale KnowledgeDocument for subject ${subjectId}: ${syncErr}`,
      );
    }

    this.logger.log(`Uploaded book PDF for subject ${subjectId}: ${s3Key}`);

    return {
      message: 'Book PDF uploaded successfully',
      subject: {
        id: updated.id,
        name: updated.name,
        bookPdfOriginalName: updated.bookPdfOriginalName,
        bookPdfSize: updated.bookPdfSize,
        hasBook: true,
      },
    };
  }

  /**
   * Generate a presigned S3 URL for downloading the book PDF.
   * Forces browser download with the original filename.
   */
  async getBookDownloadUrl(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    let bookPdfKey = subject.bookPdfKey;
    let originalName = subject.bookPdfOriginalName;

    if (!bookPdfKey) {
      const doc = await this.prisma.knowledgeDocument?.findFirst({
        where: { subjectId, kind: 'BOOK' },
        orderBy: { createdAt: 'desc' },
      });
      if (doc?.s3Key) {
        bookPdfKey = doc.s3Key;
        originalName = doc.originalName;
      }
    }

    if (!bookPdfKey) {
      throw new NotFoundException(
        'No book PDF has been uploaded for this subject',
      );
    }

    const cleanOriginalName = decodeUploadName(
      originalName ?? `${subject.name}.pdf`,
    );
    const url = await this.storage.getPresignedUrl(
      bookPdfKey,
      cleanOriginalName,
    );

    return {
      downloadUrl: url,
      originalName: cleanOriginalName,
      fileSize: subject.bookPdfSize,
    };
  }

  /**
   * Get the book file buffer directly from storage (for proxy streaming).
   */
  async getBookFile(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    let bookPdfKey = subject.bookPdfKey;
    let originalName = subject.bookPdfOriginalName;

    // Fallback: check KnowledgeDocument if subject.bookPdfKey was not populated
    if (!bookPdfKey) {
      const doc = await this.prisma.knowledgeDocument?.findFirst({
        where: { subjectId, kind: 'BOOK' },
        orderBy: { createdAt: 'desc' },
      });
      if (doc?.s3Key) {
        bookPdfKey = doc.s3Key;
        originalName = doc.originalName;
      }
    }

    if (!bookPdfKey) {
      throw new NotFoundException(
        'No book PDF has been uploaded for this subject',
      );
    }

    const buffer = await this.storage.getFileBuffer(bookPdfKey);
    if (!buffer || buffer.length === 0) {
      throw new NotFoundException('Book file content is empty or unreadable');
    }

    const cleanOriginalName = decodeUploadName(
      originalName ?? `${subject.name}.pdf`,
    );

    // Self-healing: if subject.bookPdfKey was not saved or original name was garbled, update it
    if (
      (!subject.bookPdfKey && bookPdfKey) ||
      (subject.bookPdfOriginalName &&
        subject.bookPdfOriginalName !== cleanOriginalName)
    ) {
      await this.prisma.subject
        .update({
          where: { id: subjectId },
          data: {
            bookPdfKey,
            bookPdfOriginalName: cleanOriginalName,
            bookPdfSize: buffer.length,
          },
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to sync bookPdf to subject ${subjectId}: ${err}`,
          );
        });
    }

    return {
      buffer,
      originalName: cleanOriginalName,
      fileSize: buffer.length,
    };
  }

  /**
   * Get the book file as a readable stream directly from storage (for zero-memory proxy streaming).
   */
  async getBookFileStream(subjectId: string): Promise<{
    stream: Readable;
    originalName: string;
    fileSize?: number;
  }> {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    let bookPdfKey = subject.bookPdfKey;
    let originalName = subject.bookPdfOriginalName;

    // Fallback: check KnowledgeDocument if subject.bookPdfKey was not populated
    if (!bookPdfKey) {
      const doc = await this.prisma.knowledgeDocument?.findFirst({
        where: { subjectId, kind: 'BOOK' },
        orderBy: { createdAt: 'desc' },
      });
      if (doc?.s3Key) {
        bookPdfKey = doc.s3Key;
        originalName = doc.originalName;
      }
    }

    if (!bookPdfKey) {
      throw new NotFoundException(
        'No book PDF has been uploaded for this subject',
      );
    }

    const fileStream = await this.storage.getFileStream(bookPdfKey);
    const cleanOriginalName = decodeUploadName(
      originalName ?? `${subject.name}.pdf`,
    );

    // Self-healing: if subject.bookPdfKey was not saved or original name was garbled, update it
    if (
      (!subject.bookPdfKey && bookPdfKey) ||
      (subject.bookPdfOriginalName &&
        subject.bookPdfOriginalName !== cleanOriginalName)
    ) {
      await this.prisma.subject
        .update({
          where: { id: subjectId },
          data: {
            bookPdfKey,
            bookPdfOriginalName: cleanOriginalName,
            ...(fileStream.contentLength
              ? { bookPdfSize: fileStream.contentLength }
              : {}),
          },
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to sync bookPdf to subject ${subjectId}: ${err}`,
          );
        });
    }

    return {
      stream: fileStream.stream,
      originalName: cleanOriginalName,
      fileSize: fileStream.contentLength ?? subject.bookPdfSize ?? undefined,
    };
  }

  /**
   * Remove the book PDF from a subject (admin action).
   */
  async deleteBookPdf(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (!subject.bookPdfKey) {
      throw new NotFoundException('No book PDF to delete for this subject');
    }

    try {
      await this.storage.deleteFile(subject.bookPdfKey);
    } catch (err) {
      this.logger.warn(
        `Failed to delete book PDF from storage: ${subject.bookPdfKey}`,
        err,
      );
    }

    await this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        bookPdfKey: null,
        bookPdfOriginalName: null,
        bookPdfSize: null,
      },
    });

    // Clean up associated KnowledgeDocument for this subject
    try {
      const docs = await this.prisma.knowledgeDocument.findMany({
        where: { subjectId, kind: 'BOOK' },
        select: { id: true, s3Key: true },
      });
      for (const d of docs) {
        if (d.s3Key && d.s3Key !== subject.bookPdfKey) {
          try {
            await this.storage.deleteFile(d.s3Key);
          } catch {
            /* ignore cleanup error if file was already removed */
          }
        }
        await this.prisma.knowledgeDocument.delete({ where: { id: d.id } });
      }
    } catch (cleanErr) {
      this.logger.warn(
        `Failed to clean KnowledgeDocument on deleteBookPdf: ${cleanErr}`,
      );
    }

    this.logger.log(`Deleted book PDF for subject ${subjectId}`);

    return { message: 'Book PDF deleted successfully' };
  }
}
