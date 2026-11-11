import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesService } from './roles.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const actor = (roleId: string, permissions: string[]) =>
  ({
    id: 'actor',
    email: 'a@x.test',
    role: Role.ADMIN,
    staffRole: { id: roleId, name: roleId },
    permissions,
  }) as unknown as AuthenticatedUser;

describe('RolesService', () => {
  const prisma = {
    staffRole: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const redis = { invalidateUserCache: jest.fn() };
  const service = new RolesService(prisma as never, redis as never);
  const manager = actor('roles_admin', [
    'roles.manage',
    'users.view',
    'chats.view',
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.staffRole.findMany.mockResolvedValue([]);
  });

  it('rejects unknown permission ids', async () => {
    await expect(
      service.create(manager, {
        id: 'helpers',
        name: 'x',
        permissions: ['users.view', 'root.everything'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects granting permissions the actor lacks', async () => {
    await expect(
      service.create(manager, {
        id: 'helpers',
        name: 'x',
        permissions: ['bank.delete'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reserves the super_admin and student ids', async () => {
    await expect(
      service.create(manager, { id: 'student', name: 'x', permissions: [] }),
    ).rejects.toThrow('محجوز');
  });

  it('skips system roles when saving the matrix', async () => {
    prisma.staffRole.findMany.mockResolvedValueOnce([
      { id: 'super_admin', system: true, permissions: [] },
    ]);
    await service.saveMatrix(manager, [{ id: 'super_admin', permissions: [] }]);
    expect(prisma.staffRole.update).not.toHaveBeenCalled();
  });

  it("won't let you drop roles.manage from your own role", async () => {
    prisma.staffRole.findMany.mockResolvedValueOnce([
      {
        id: 'roles_admin',
        system: false,
        permissions: ['roles.manage', 'users.view'],
      },
    ]);
    await expect(
      service.saveMatrix(manager, [
        { id: 'roles_admin', permissions: ['users.view'] },
      ]),
    ).rejects.toThrow('دورك أنت');
  });

  it("won't let you strip permissions you don't hold from another role", async () => {
    prisma.staffRole.findMany.mockResolvedValueOnce([
      {
        id: 'content_admin',
        system: false,
        permissions: ['bank.delete', 'users.view'],
      },
    ]);
    await expect(
      service.saveMatrix(manager, [
        { id: 'content_admin', permissions: ['users.view'] },
      ]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('saves changed roles and refreshes their members', async () => {
    prisma.staffRole.findMany.mockResolvedValueOnce([
      { id: 'support', system: false, permissions: ['users.view'] },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }]);
    await service.saveMatrix(manager, [
      { id: 'support', permissions: ['chats.view', 'users.view'] },
    ]);
    expect(prisma.staffRole.update).toHaveBeenCalledWith({
      where: { id: 'support' },
      data: { permissions: ['users.view', 'chats.view'] },
    });
    expect(redis.invalidateUserCache).toHaveBeenCalledTimes(2);
  });

  it('refuses to delete a role that still has members', async () => {
    prisma.staffRole.findUnique.mockResolvedValueOnce({
      id: 'support',
      system: false,
      permissions: ['users.view'],
    });
    prisma.user.count.mockResolvedValueOnce(3);
    await expect(service.remove(manager, 'support')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.staffRole.delete).not.toHaveBeenCalled();
  });
});
