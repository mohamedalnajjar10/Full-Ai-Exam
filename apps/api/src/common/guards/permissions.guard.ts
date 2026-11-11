import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/permissions.decorator';

interface RequestUser {
  role?: Role;
  /** بيحسبها JwtStrategy من دور الفريق */
  permissions?: string[];
}

/**
 * بيفحص @RequirePermissions / @RequireAnyPermission. مسجّل عالمياً بعد
 * JwtAuthGuard، فـ request.user جاهز هون.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      PermissionRequirement | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.permissions.length === 0) return true;

    // Express.User من passport فاضي؛ الشكل الفعلي من JwtStrategy
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser }>();
    const granted = new Set(user?.role === Role.ADMIN ? user.permissions : []);
    const ok =
      required.mode === 'all'
        ? required.permissions.every((p) => granted.has(p))
        : required.permissions.some((p) => granted.has(p));
    if (!ok) {
      throw new ForbiddenException('ليس لديك صلاحية لهذا الإجراء.');
    }
    return true;
  }
}
