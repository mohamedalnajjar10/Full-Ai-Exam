import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { SUPER_ADMIN_ROLE_ID } from '@ai-exam/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TokenService } from '../auth/services/token.service';
import { PasswordService } from '../auth/services/password.service';
import { effectivePermissions } from '../common/permissions';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuotaService } from '../usage/quota.service';
import type {
  InviteUserDto,
  ListUsersDto,
  UpdateUserDto,
} from './dto/platform.dto';

export const STUDENT_ROLE = 'student';

export type UserStatus = 'active' | 'suspended' | 'unverified';

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  staffRoleId: true,
  staffRole: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  emailVerified: true,
  suspendedAt: true,
  suspendedReason: true,
  twoFactorEnabled: true,
  oauthProvider: true,
  passwordHash: true,
  lastActiveAt: true,
  dailyQuota: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * إدارة الحسابات من لوحة التحكم. القاعدة الأساسية ضد التصعيد: ما حدا
 * بيقدر يعطي دور فيه صلاحية هو ما عنده، والمدير العام بس بيعدّل مدير عام.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly quota: QuotaService,
  ) {}

  /* ───────── القراءة ───────── */

  private where(dto: ListUsersDto): Prisma.UserWhereInput {
    const and: Prisma.UserWhereInput[] = [];
    const q = dto.q?.trim();
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (dto.role === STUDENT_ROLE) and.push({ role: Role.STUDENT });
    else if (dto.role) and.push({ role: Role.ADMIN, staffRoleId: dto.role });
    if (dto.status === 'suspended') and.push({ suspendedAt: { not: null } });
    if (dto.status === 'unverified') {
      and.push({ suspendedAt: null, emailVerified: false });
    }
    if (dto.status === 'active') {
      and.push({ suspendedAt: null, emailVerified: true });
    }
    if (dto.branchId) and.push({ branchId: dto.branchId });
    return and.length ? { AND: and } : {};
  }

  private toRow(u: ListRow, generationsToday = 0) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === Role.ADMIN ? (u.staffRoleId ?? null) : STUDENT_ROLE,
      roleName:
        u.role === Role.ADMIN ? (u.staffRole?.name ?? 'فريق بلا دور') : 'طالب',
      branch: u.branch,
      status: u.suspendedAt
        ? 'suspended'
        : u.emailVerified
          ? 'active'
          : 'unverified',
      suspendedAt: u.suspendedAt,
      suspendedReason: u.suspendedReason,
      twoFactor: u.twoFactorEnabled,
      provider:
        u.oauthProvider?.toUpperCase() === 'GOOGLE' ? 'google' : 'email',
      hasPassword: Boolean(u.passwordHash),
      lastActiveAt: u.lastActiveAt,
      dailyQuota: u.dailyQuota,
      createdAt: u.createdAt,
      generationsToday,
    };
  }

  async list(dto: ListUsersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const where = this.where(dto);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);

    const [rows, total, all, activeWeek, unverified, suspended] =
      await Promise.all([
        this.prisma.user.findMany({
          where,
          select: LIST_SELECT,
          orderBy: [
            { lastActiveAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.user.count({ where }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { lastActiveAt: { gte: weekAgo } } }),
        this.prisma.user.count({
          where: { emailVerified: false, suspendedAt: null },
        }),
        this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      ]);

    const used = await this.quota.usedToday(rows.map((r) => r.id));
    return {
      items: rows.map((r) => this.toRow(r, used.get(r.id) ?? 0)),
      total,
      page,
      limit,
      stats: { total: all, activeWeek, unverified, suspended },
    };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: LIST_SELECT,
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود.');

    const now = new Date();
    const [quota, sessions, chats, messages, generated] = await Promise.all([
      this.quota.status(id),
      this.prisma.refreshToken.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.chatSession.count({ where: { studentId: id } }),
      this.prisma.chatMessage.count({
        where: { session: { studentId: id }, role: 'STUDENT' },
      }),
      this.prisma.generatedQuestion.count({ where: { studentId: id } }),
    ]);

    return {
      ...this.toRow(user, quota.used),
      quota,
      sessions,
      activity: { chats, messages, generated },
    };
  }

  /** CSV بكل الحسابات المطابقة للفلاتر (حتى 10 آلاف) */
  async exportCsv(dto: ListUsersDto): Promise<string> {
    const rows = await this.prisma.user.findMany({
      where: this.where(dto),
      select: LIST_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 10_000,
    });
    const cell = (v: string | number | boolean | Date | null | undefined) => {
      const s =
        v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
      // = + - @ بأول الخلية بتتنفّذ كصيغة بـ Excel
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = [
      'id',
      'name',
      'email',
      'role',
      'branch',
      'status',
      'two_factor',
      'provider',
      'last_active',
      'joined',
    ];
    const lines = rows.map((u) => {
      const r = this.toRow(u);
      return [
        r.id,
        r.name,
        r.email,
        r.roleName,
        r.branch?.name,
        r.status,
        r.twoFactor,
        r.provider,
        r.lastActiveAt,
        r.createdAt,
      ]
        .map(cell)
        .join(',');
    });
    // BOM حتى Excel يقرا العربي صح
    return '﻿' + [header.join(','), ...lines].join('\n');
  }

  /* ───────── الحماية من التصعيد ───────── */

  private isSuperAdmin(actor: AuthenticatedUser) {
    return actor.staffRole?.id === SUPER_ADMIN_ROLE_ID;
  }

  /** بيتأكد إنو الفاعل بيقدر يعطي هالدور: صلاحياته لازم تكون ضمن صلاحياته هو */
  private async assertCanAssign(actor: AuthenticatedUser, roleValue: string) {
    if (roleValue === STUDENT_ROLE) return;
    const role = await this.prisma.staffRole.findUnique({
      where: { id: roleValue },
    });
    if (!role) throw new BadRequestException('الدور غير موجود.');
    if (role.id === SUPER_ADMIN_ROLE_ID && !this.isSuperAdmin(actor)) {
      throw new ForbiddenException('المدير العام فقط يمنح دور المدير العام.');
    }
    const mine = new Set(actor.permissions);
    const missing = effectivePermissions({
      role: Role.ADMIN,
      staffRole: role,
    }).filter((p) => !mine.has(p));
    if (missing.length) {
      throw new ForbiddenException(
        `لا يمكنك منح دور فيه صلاحيات لا تملكها (${missing.join('، ')}).`,
      );
    }
  }

  /**
   * ما بتقدر تعدّل (توقف، تخفّض، تعطّل أمانه) حساب عنده صلاحية إنت ما
   * عندك — وإلا الدعم الفني كان يقدر يوقف مدير المحتوى. المدير العام
   * عنده كل شي، فحسابه محمي تلقائياً من غير المدير العام.
   */
  private assertCanTouch(
    actor: AuthenticatedUser,
    target: Awaited<ReturnType<AdminUsersService['load']>>,
  ) {
    if (target.id === actor.id) return;
    const mine = new Set(actor.permissions);
    const theirs = effectivePermissions(target);
    if (theirs.some((p) => !mine.has(p))) {
      throw new ForbiddenException(
        target.staffRoleId === SUPER_ADMIN_ROLE_ID
          ? 'لا يمكن تعديل حساب المدير العام.'
          : 'لا يمكنك تعديل حساب لديه صلاحيات لا تملكها.',
      );
    }
  }

  /** لازم يضل مدير عام فعّال واحد على الأقل */
  private async assertNotLastSuperAdmin(userId: string) {
    const others = await this.prisma.user.count({
      where: {
        id: { not: userId },
        role: Role.ADMIN,
        staffRoleId: SUPER_ADMIN_ROLE_ID,
        suspendedAt: null,
      },
    });
    if (others === 0) {
      throw new ConflictException('هذا آخر مدير عام فعّال — عيّن غيره أولاً.');
    }
  }

  private async load(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        staffRoleId: true,
        suspendedAt: true,
        staffRole: { select: { id: true, permissions: true } },
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود.');
    return user;
  }

  /** الكاش (60 ث) بيحمل الدور والصلاحيات — لازم يفضى حتى التغيير يسري فوراً */
  private refresh(userId: string) {
    return this.redis.invalidateUserCache(userId);
  }

  /* ───────── التعديل ───────── */

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const target = await this.load(id);
    this.assertCanTouch(actor, target);
    const data: Prisma.UserUpdateInput = {};

    if (dto.role !== undefined) {
      const current =
        target.role === Role.ADMIN ? target.staffRoleId : STUDENT_ROLE;
      if (dto.role !== current) {
        if (id === actor.id) {
          throw new ForbiddenException('لا يمكنك تغيير دورك بنفسك.');
        }
        await this.assertCanAssign(actor, dto.role);
        if (target.staffRoleId === SUPER_ADMIN_ROLE_ID) {
          await this.assertNotLastSuperAdmin(id);
        }
        if (dto.role === STUDENT_ROLE) {
          data.role = Role.STUDENT;
          data.staffRole = { disconnect: true };
        } else {
          data.role = Role.ADMIN;
          data.staffRole = { connect: { id: dto.role } };
        }
      }
    }
    if (dto.dailyQuota !== undefined) data.dailyQuota = dto.dailyQuota;

    await this.prisma.user.update({ where: { id }, data });
    await this.refresh(id);
    this.logger.log(
      `${actor.email} updated user ${id}: ${JSON.stringify(dto)}`,
    );
    return this.detail(id);
  }

  async suspend(actor: AuthenticatedUser, id: string, reason: string) {
    if (id === actor.id) {
      throw new ForbiddenException('لا يمكنك إيقاف حسابك.');
    }
    const target = await this.load(id);
    this.assertCanTouch(actor, target);
    if (target.staffRoleId === SUPER_ADMIN_ROLE_ID) {
      await this.assertNotLastSuperAdmin(id);
    }
    await this.prisma.user.update({
      where: { id },
      data: { suspendedAt: new Date(), suspendedReason: reason.trim() },
    });
    // الإيقاف بيسري فوراً: الجلسات بتنلغى والـ JWT strategy بيرفضه
    await this.tokens.endAllSessions(id);
    await this.refresh(id);
    this.logger.warn(`${actor.email} suspended user ${id}: ${reason}`);
    return this.detail(id);
  }

  async unsuspend(actor: AuthenticatedUser, id: string) {
    const target = await this.load(id);
    this.assertCanTouch(actor, target);
    await this.prisma.user.update({
      where: { id },
      data: { suspendedAt: null, suspendedReason: null },
    });
    await this.refresh(id);
    this.logger.log(`${actor.email} reactivated user ${id}`);
    return this.detail(id);
  }

  async verifyEmail(actor: AuthenticatedUser, id: string) {
    this.assertCanTouch(actor, await this.load(id));
    await this.prisma.user.update({
      where: { id },
      data: { emailVerified: true },
    });
    await this.refresh(id);
    return this.detail(id);
  }

  async disableTwoFactor(actor: AuthenticatedUser, id: string) {
    this.assertCanTouch(actor, await this.load(id));
    await this.prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });
    await this.refresh(id);
    this.logger.warn(`${actor.email} disabled 2FA for user ${id}`);
    return this.detail(id);
  }

  async endSessions(actor: AuthenticatedUser, id: string) {
    this.assertCanTouch(actor, await this.load(id));
    await this.tokens.endAllSessions(id);
    await this.refresh(id);
    return this.detail(id);
  }

  async sendPasswordReset(actor: AuthenticatedUser, id: string) {
    this.assertCanTouch(actor, await this.load(id));
    const { email } = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { email: true },
    });
    await this.passwords.forgotPassword({ email });
    return { message: 'أُرسل رابط إعادة تعيين كلمة المرور.' };
  }

  async resetQuota(id: string) {
    await this.load(id);
    await this.quota.reset(id);
    return this.detail(id);
  }

  /**
   * دعوة عضو فريق: حساب ADMIN بالدور المطلوب بدون كلمة مرور، وبيوصله رابط
   * «تعيين كلمة المرور» (نفس رابط الاستعادة). حساب موجود منغيّر دوره من
   * صفحة المستخدم بدل الدعوة.
   */
  async invite(actor: AuthenticatedUser, dto: InviteUserDto) {
    if (dto.roleId === STUDENT_ROLE) {
      throw new BadRequestException('الدعوة لأعضاء الفريق فقط.');
    }
    await this.assertCanAssign(actor, dto.roleId);
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(
        'يوجد حساب بهذا البريد — غيّر دوره من صفحته بدل الدعوة.',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name?.trim() || null,
        role: Role.ADMIN,
        staffRoleId: dto.roleId,
        // الرابط بيوصل لبريده؛ فتحه بيثبت ملكيته
        emailVerified: true,
      },
      select: { id: true },
    });
    await this.passwords.forgotPassword({ email: dto.email });
    this.logger.log(`${actor.email} invited ${dto.email} as ${dto.roleId}`);
    return this.detail(user.id);
  }
}
