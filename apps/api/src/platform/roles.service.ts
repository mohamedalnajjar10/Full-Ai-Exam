import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  SUPER_ADMIN_ROLE_ID,
  isPermission,
} from '@ai-exam/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { effectivePermissions } from '../common/permissions';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import type {
  CreateRoleDto,
  MatrixRowDto,
  SaveRoleDto,
} from './dto/platform.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list() {
    const [roles, students] = await Promise.all([
      this.prisma.staffRole.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: [{ system: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
    ]);
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        system: r.system,
        dailyQuota: r.dailyQuota,
        members: r._count.users,
        // المدير العام كل الصلاحيات دائماً — منرجّعها صريحة للمصفوفة
        permissions: effectivePermissions({ role: Role.ADMIN, staffRole: r }),
      })),
      students,
    };
  }

  /* ───────── فحوصات ───────── */

  /** معرّفات صحيحة، وكلها من صلاحيات الفاعل نفسه (ما في تصعيد) */
  private clean(actor: AuthenticatedUser, permissions: string[]): string[] {
    const unknown = permissions.filter((p) => !isPermission(p));
    if (unknown.length) {
      throw new BadRequestException(
        `صلاحيات غير معروفة: ${unknown.join('، ')}`,
      );
    }
    const mine = new Set(actor.permissions);
    const beyond = permissions.filter((p) => !mine.has(p));
    if (beyond.length) {
      throw new ForbiddenException(
        `لا يمكنك منح صلاحيات لا تملكها (${beyond.join('، ')}).`,
      );
    }
    // ترتيب الكتالوج — حتى الفرق بالمقارنة يبيّن صح
    return ALL_PERMISSIONS.filter((p) => permissions.includes(p));
  }

  private async editable(id: string) {
    const role = await this.prisma.staffRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('الدور غير موجود.');
    return role;
  }

  /** إزالة صلاحية من دور بيقلّل صلاحيات ناس عندهم أكتر منك؟ ممنوع إلا للمدير العام */
  private assertPermissionsChangeAllowed(
    actor: AuthenticatedUser,
    role: { id: string; permissions: string[]; system: boolean },
    next: string[],
  ) {
    if (role.system) {
      throw new ForbiddenException('صلاحيات أدوار النظام ثابتة.');
    }
    const removed = role.permissions.filter((p) => !next.includes(p));
    const mine = new Set(actor.permissions);
    if (removed.some((p) => !mine.has(p))) {
      throw new ForbiddenException('لا يمكنك تعديل دور فيه صلاحيات لا تملكها.');
    }
    if (actor.staffRole?.id === role.id && !next.includes('roles.manage')) {
      throw new ForbiddenException(
        'لا يمكنك إزالة «إدارة الأدوار» من دورك أنت — ستفقد الوصول لهذه الصفحة.',
      );
    }
  }

  /** الصلاحيات بكاش JwtStrategy (60 ث) — منمسحه لأعضاء الدور حتى يسري فوراً */
  private async refreshMembers(roleId: string) {
    const members = await this.prisma.user.findMany({
      where: { staffRoleId: roleId },
      select: { id: true },
    });
    await Promise.all(members.map((m) => this.redis.invalidateUserCache(m.id)));
  }

  /* ───────── التعديل ───────── */

  async create(actor: AuthenticatedUser, dto: CreateRoleDto) {
    if (dto.id === SUPER_ADMIN_ROLE_ID || dto.id === 'student') {
      throw new BadRequestException('هذا المعرّف محجوز.');
    }
    try {
      await this.prisma.staffRole.create({
        data: {
          id: dto.id,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          permissions: this.clean(actor, dto.permissions),
          dailyQuota: dto.dailyQuota ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('يوجد دور بهذا المعرّف.');
      }
      throw err;
    }
    this.logger.log(`${actor.email} created role ${dto.id}`);
    return this.list();
  }

  async update(actor: AuthenticatedUser, id: string, dto: SaveRoleDto) {
    const role = await this.editable(id);
    const data: Prisma.StaffRoleUpdateInput = {
      name: dto.name.trim(),
      description: dto.description?.trim() ?? role.description,
    };
    if (dto.dailyQuota !== undefined) data.dailyQuota = dto.dailyQuota;
    const next = this.clean(actor, dto.permissions);
    const changed =
      !role.system &&
      (next.length !== role.permissions.length ||
        next.some((p) => !role.permissions.includes(p)));
    if (changed) {
      this.assertPermissionsChangeAllowed(actor, role, next);
      data.permissions = next;
    }
    await this.prisma.staffRole.update({ where: { id }, data });
    if (changed) await this.refreshMembers(id);
    this.logger.log(`${actor.email} updated role ${id}`);
    return this.list();
  }

  /** حفظ المصفوفة كاملة — بس الأدوار يلي تغيّرت صلاحياتها، بمعاملة وحدة */
  async saveMatrix(actor: AuthenticatedUser, rows: MatrixRowDto[]) {
    const roles = await this.prisma.staffRole.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    const byId = new Map(roles.map((r) => [r.id, r]));
    const updates: { id: string; permissions: string[] }[] = [];
    for (const row of rows) {
      const role = byId.get(row.id);
      if (!role) throw new NotFoundException(`الدور ${row.id} غير موجود.`);
      if (role.system) continue;
      const next = this.clean(actor, row.permissions);
      const same =
        next.length === role.permissions.length &&
        next.every((p) => role.permissions.includes(p));
      if (same) continue;
      this.assertPermissionsChangeAllowed(actor, role, next);
      updates.push({ id: role.id, permissions: next });
    }
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.staffRole.update({
          where: { id: u.id },
          data: { permissions: u.permissions },
        }),
      ),
    );
    await Promise.all(updates.map((u) => this.refreshMembers(u.id)));
    this.logger.log(
      `${actor.email} saved permission matrix (${updates.map((u) => u.id).join(', ') || 'no changes'})`,
    );
    return this.list();
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const role = await this.editable(id);
    if (role.system) throw new ForbiddenException('لا يمكن حذف أدوار النظام.');
    this.assertPermissionsChangeAllowed(actor, role, []);
    const members = await this.prisma.user.count({
      where: { staffRoleId: id },
    });
    if (members > 0) {
      throw new ConflictException(
        `لهذا الدور ${members} عضو — انقلهم لدور آخر قبل الحذف.`,
      );
    }
    await this.prisma.staffRole.delete({ where: { id } });
    this.logger.log(`${actor.email} deleted role ${id}`);
    return this.list();
  }
}
