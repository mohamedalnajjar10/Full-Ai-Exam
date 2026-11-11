import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Teacher } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { resolveExamMimeType } from '../common';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
  TeacherQueryDto,
  ReorderTeachersDto,
} from './dto';

export interface PaginatedTeachersResponse {
  data: (Teacher & { subject: { id: string; name: string } | null })[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TeachersService {
  private readonly logger = new Logger(TeachersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Helper to build public image URL from S3 key
   */
  private buildImageUrl(key: string): string {
    const endpoint = this.config.get<string>('AWS_S3_ENDPOINT');
    const bucket = this.config.get<string>('AWS_S3_BUCKET_NAME');
    const region = this.config.get<string>('AWS_REGION') || 'us-east-1';

    if (endpoint) {
      // S3-compatible (MinIO / LocalStack / R2)
      return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  /**
   * Create a new teacher with optional subject link and optional photo upload
   */
  async create(
    dto: CreateTeacherDto,
    file?: Express.Multer.File,
  ): Promise<Teacher> {
    let subjectId = dto.subjectId;
    if (subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (!subject) {
        throw new NotFoundException(`Subject with ID '${subjectId}' not found`);
      }
    } else {
      // Auto-resolve a real subjectId based on teacher title / specialization keywords
      const resolvedId = await this.resolveSubjectId(dto.title, dto.bio);
      if (resolvedId) {
        subjectId = resolvedId;
      }
    }

    let imageKey: string | undefined = undefined;
    let imageUrl: string | undefined = dto.imageUrl;

    if (file) {
      const mime = resolveExamMimeType(file);
      if (!mime || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
        throw new BadRequestException(
          'صيغة الصورة غير مدعومة. الصيغ المسموحة: JPEG, PNG, WebP, GIF',
        );
      }
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const safeExt = extMap[mime] || 'jpg';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${safeExt}`;
      const s3Key = `teachers/${uniqueName}`;

      try {
        await this.storage.uploadFile(s3Key, file.buffer, mime);
        imageKey = s3Key;
        imageUrl = this.buildImageUrl(s3Key);
        this.logger.log(`Uploaded teacher photo: ${s3Key}`);
      } catch (err) {
        this.logger.error('Failed to upload teacher photo to storage', err);
        throw new BadRequestException('Failed to upload teacher photo');
      }
    }

    // Determine display order if not explicitly set
    let displayOrder = dto.displayOrder ?? 0;
    if (displayOrder === 0) {
      const maxOrder = await this.prisma.teacher.aggregate({
        _max: { displayOrder: true },
      });
      displayOrder = (maxOrder._max.displayOrder ?? 0) + 1;
    }

    // Return newly added teacher with associated subject relation
    return this.prisma.teacher.create({
      data: {
        name: dto.name,
        title: dto.title,
        bio: dto.bio,
        imageUrl: imageUrl ?? null,
        imageKey: imageKey ?? null,
        subjectId: subjectId ?? null,
        yearsOfExperience: dto.yearsOfExperience ?? null,
        isActive: dto.isActive ?? true,
        displayOrder,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Find teachers with pagination, text search, subject filtering, and sorting
   */
  async findAll(query: TeacherQueryDto): Promise<PaginatedTeachersResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.TeacherWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.subjectId) {
      where.subjectId = query.subjectId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortField = query.sortBy || 'displayOrder';
    const sortOrder = query.sortOrder || 'asc';
    const orderBy: Prisma.TeacherOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [total, data] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Find a single teacher by ID
   */
  async findOne(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            branchId: true,
          },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID '${id}' not found`);
    }

    return teacher;
  }

  /**
   * Update teacher fields, optionally replacing the photo
   */
  async update(
    id: string,
    dto: UpdateTeacherDto,
    file?: Express.Multer.File,
  ): Promise<Teacher> {
    const teacher = await this.findOne(id);

    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
      });
      if (!subject) {
        throw new NotFoundException(
          `Subject with ID '${dto.subjectId}' not found`,
        );
      }
    }

    let imageKey = teacher.imageKey;
    let imageUrl = dto.imageUrl !== undefined ? dto.imageUrl : teacher.imageUrl;

    if (file) {
      const mime = resolveExamMimeType(file);
      if (!mime || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
        throw new BadRequestException(
          'صيغة الصورة غير مدعومة. الصيغ المسموحة: JPEG, PNG, WebP, GIF',
        );
      }

      // Clean up previous image if it was hosted in storage
      if (teacher.imageKey) {
        try {
          await this.storage.deleteFile(teacher.imageKey);
        } catch (err) {
          this.logger.warn(
            `Failed to delete existing image: ${teacher.imageKey}`,
            err,
          );
        }
      }

      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const safeExt = extMap[mime] || 'jpg';
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${safeExt}`;
      const s3Key = `teachers/${uniqueName}`;

      await this.storage.uploadFile(s3Key, file.buffer, mime);
      imageKey = s3Key;
      imageUrl = this.buildImageUrl(s3Key);
    }

    return this.prisma.teacher.update({
      where: { id },
      data: {
        name: dto.name,
        title: dto.title,
        bio: dto.bio,
        imageUrl,
        imageKey,
        subjectId: dto.subjectId !== undefined ? dto.subjectId : undefined,
        yearsOfExperience:
          dto.yearsOfExperience !== undefined
            ? dto.yearsOfExperience
            : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
        displayOrder:
          dto.displayOrder !== undefined ? dto.displayOrder : undefined,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Upload or replace a teacher's photo directly
   */
  async uploadPhoto(id: string, file: Express.Multer.File): Promise<Teacher> {
    return this.update(id, {}, file);
  }

  /**
   * Retrieve the photo buffer and mimeType for a teacher
   */
  async getPhotoBuffer(
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const teacher = await this.findOne(id);
    if (!teacher.imageKey) {
      throw new NotFoundException('Teacher does not have a photo stored');
    }

    const buffer = await this.storage.getFileBuffer(teacher.imageKey);
    const mimeType = teacher.imageKey.endsWith('.png')
      ? 'image/png'
      : teacher.imageKey.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    return { buffer, mimeType };
  }

  /**
   * Remove a teacher and delete their photo from storage
   */
  async remove(id: string): Promise<{ message: string }> {
    const teacher = await this.findOne(id);

    if (teacher.imageKey) {
      try {
        await this.storage.deleteFile(teacher.imageKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete image ${teacher.imageKey} on teacher removal`,
          err,
        );
      }
    }

    await this.prisma.teacher.delete({ where: { id } });

    return { message: `Teacher '${teacher.name}' deleted successfully` };
  }

  /**
   * Reorder teachers within a transaction
   */
  async reorder(dto: ReorderTeachersDto): Promise<{ message: string }> {
    await this.prisma.$transaction(
      dto.orders.map((item) =>
        this.prisma.teacher.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        }),
      ),
    );
    return { message: 'Teachers reordered successfully' };
  }

  /**
   * Automatically resolve a real Subject ID based on teacher specialization title/bio keywords
   */
  async resolveSubjectId(title: string, bio?: string): Promise<string | null> {
    // كان findMany() بدون where/select/take — بيحمّل كل صفوف المواد بكل
    // أعمدتها على كل إنشاء معلّم. الدالة بتحتاج الاسم والمعرّف بس.
    const subjects = await this.prisma.subject.findMany({
      select: { id: true, name: true },
    });
    if (subjects.length === 0) return null;

    const normalize = (text: string) =>
      (text || '')
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F]/g, '')
        .trim();

    const normalizedTitle = normalize(title);
    const normalizedBio = normalize(bio || '');
    const combined = `${normalizedTitle} ${normalizedBio}`;

    // Common Arabic subject keywords mapping
    const keywordMap: { patterns: string[]; subjectKeyword: string }[] = [
      {
        patterns: ['عرب', 'لغه عربيه', 'نحو', 'ادب', 'بلاغه'],
        subjectKeyword: 'عرب',
      },
      {
        patterns: ['انجل', 'انجليز', 'لغه انجليزيه', 'english'],
        subjectKeyword: 'انجل',
      },
      {
        patterns: ['رياض', 'حساب', 'جبر', 'تفاضل', 'هندسه', 'math'],
        subjectKeyword: 'رياض',
      },
      {
        patterns: ['فيزي', 'physics', 'ميكانيكا', 'ديناميكا'],
        subjectKeyword: 'فيزي',
      },
      { patterns: ['كيمي', 'chemistry'], subjectKeyword: 'كيمي' },
      {
        patterns: ['احي', 'احياء', 'بيولوجي', 'biology'],
        subjectKeyword: 'احي',
      },
      {
        patterns: ['اسلام', 'دين', 'فقه', 'شريع', 'قران', 'تلاوه', 'حديث'],
        subjectKeyword: 'اسلام',
      },
      { patterns: ['تاريخ', 'history'], subjectKeyword: 'تاريخ' },
      { patterns: ['جغراف', 'geography'], subjectKeyword: 'جغراف' },
      { patterns: ['تكنول', 'حاسوب', 'برمج'], subjectKeyword: 'تكنول' },
    ];

    for (const entry of keywordMap) {
      if (entry.patterns.some((p) => combined.includes(p))) {
        const found = subjects.find((s) =>
          normalize(s.name).includes(entry.subjectKeyword),
        );
        if (found) return found.id;
      }
    }

    for (const subject of subjects) {
      const normalizedSub = normalize(subject.name);
      if (
        combined.includes(normalizedSub) ||
        normalizedSub.includes(normalizedTitle)
      ) {
        return subject.id;
      }
    }

    // ما في تطابق. قبل هيك كانت بترجّع subjects[0] — يعني المعلّم بينربط
    // بأول مادة بالجدول اعتباطياً. subjectId اختياري بالسكيما، فإرجاع null
    // أصح من ربط خاطئ صامت.
    return null;
  }
}
