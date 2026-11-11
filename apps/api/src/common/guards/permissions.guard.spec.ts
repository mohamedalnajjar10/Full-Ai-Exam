import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../decorators/permissions.decorator';

function contextFor(
  handler: () => void,
  user?: { role: Role; permissions: string[] },
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  class Routes {
    open() {}
    @RequirePermissions('users.view', 'users.manage')
    both() {}
    @RequireAnyPermission('bank.edit', 'content.review')
    either() {}
  }
  const routes = Routes.prototype;
  const admin = (...permissions: string[]) => ({
    role: Role.ADMIN,
    permissions,
  });

  it('lets unprotected routes through', () => {
    expect(guard.canActivate(contextFor(routes.open))).toBe(true);
  });

  it('requires every permission in "all" mode', () => {
    expect(
      guard.canActivate(
        contextFor(routes.both, admin('users.view', 'users.manage')),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(routes.both, admin('users.view'))),
    ).toThrow(ForbiddenException);
  });

  it('accepts any one permission in "any" mode', () => {
    expect(
      guard.canActivate(contextFor(routes.either, admin('content.review'))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(routes.either, admin('users.view'))),
    ).toThrow(ForbiddenException);
  });

  it('never grants a student, whatever permissions the object carries', () => {
    expect(() =>
      guard.canActivate(
        contextFor(routes.either, {
          role: Role.STUDENT,
          permissions: ['bank.edit'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request without a user', () => {
    expect(() => guard.canActivate(contextFor(routes.either))).toThrow(
      ForbiddenException,
    );
  });
});
