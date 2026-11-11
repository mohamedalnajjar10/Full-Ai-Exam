import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ALL_PERMISSIONS } from '@ai-exam/types';
import { AdminUsersService } from './admin-users.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const ROLES = {
  super_admin: { id: 'super_admin', permissions: [] as string[] },
  content_admin: {
    id: 'content_admin',
    permissions: ['content.upload', 'bank.edit', 'users.view'],
  },
  support: {
    id: 'support',
    permissions: ['users.view', 'users.manage', 'chats.view'],
  },
};

function actor(roleId: keyof typeof ROLES, id = 'actor'): AuthenticatedUser {
  const perms =
    roleId === 'super_admin' ? [...ALL_PERMISSIONS] : ROLES[roleId].permissions;
  return {
    id,
    email: `${id}@x.test`,
    role: Role.ADMIN,
    staffRole: { id: roleId, name: roleId },
    permissions: perms,
  } as unknown as AuthenticatedUser;
}

function target(roleId: keyof typeof ROLES | null, id = 'target') {
  return {
    id,
    role: roleId ? Role.ADMIN : Role.STUDENT,
    staffRoleId: roleId,
    suspendedAt: null,
    staffRole: roleId ? ROLES[roleId] : null,
  };
}

describe('AdminUsersService — escalation rules', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    staffRole: { findUnique: jest.fn() },
    refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
    chatSession: { count: jest.fn().mockResolvedValue(0) },
    chatMessage: { count: jest.fn().mockResolvedValue(0) },
    generatedQuestion: { count: jest.fn().mockResolvedValue(0) },
  };
  const redis = { invalidateUserCache: jest.fn() };
  const tokens = { endAllSessions: jest.fn() };
  const passwords = { forgotPassword: jest.fn() };
  const quota = {
    status: jest.fn().mockResolvedValue({ limit: 20, used: 0, resetAt: '' }),
  };
  const service = new AdminUsersService(
    prisma as never,
    redis as never,
    tokens as never,
    passwords as never,
    quota as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.staffRole.findUnique.mockImplementation(
      ({ where }: { where: { id: keyof typeof ROLES } }) => ROLES[where.id],
    );
    // load() ثم detail() — نفس السجل يكفي للاتنين
    prisma.user.findUnique.mockResolvedValue({
      ...target(null),
      email: 't@x.test',
      branch: null,
      emailVerified: true,
      twoFactorEnabled: false,
      oauthProvider: null,
      passwordHash: 'h',
      lastActiveAt: null,
      dailyQuota: null,
      createdAt: new Date(),
      name: 'T',
      suspendedReason: null,
    });
    prisma.user.count.mockResolvedValue(1);
  });

  const loadAs = (t: ReturnType<typeof target>) =>
    prisma.user.findUnique.mockResolvedValueOnce(t);

  it('blocks granting a role with permissions the actor lacks', async () => {
    loadAs(target(null));
    await expect(
      service.update(actor('support'), 'target', { role: 'content_admin' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('only a super admin grants super admin', async () => {
    loadAs(target(null));
    await expect(
      service.update(actor('content_admin'), 'target', { role: 'super_admin' }),
    ).rejects.toThrow('المدير العام فقط');
  });

  it('lets a super admin promote a student', async () => {
    loadAs(target(null));
    await service.update(actor('super_admin'), 'target', {
      role: 'content_admin',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: Role.ADMIN,
          staffRole: { connect: { id: 'content_admin' } },
        }),
      }),
    );
    expect(redis.invalidateUserCache).toHaveBeenCalledWith('target');
  });

  it('forbids changing your own role', async () => {
    loadAs(target('super_admin', 'actor'));
    await expect(
      service.update(actor('super_admin'), 'actor', { role: 'student' }),
    ).rejects.toThrow('دورك بنفسك');
  });

  it('forbids touching an account with more permissions', async () => {
    loadAs(target('content_admin'));
    await expect(
      service.suspend(actor('support'), 'target', 'spam'),
    ).rejects.toThrow(ForbiddenException);
    loadAs(target('super_admin'));
    await expect(
      service.disableTwoFactor(actor('content_admin'), 'target'),
    ).rejects.toThrow('المدير العام');
  });

  it('forbids suspending yourself', async () => {
    await expect(
      service.suspend(actor('super_admin'), 'actor', 'x'),
    ).rejects.toThrow('حسابك');
  });

  it('keeps at least one active super admin', async () => {
    loadAs(target('super_admin'));
    prisma.user.count.mockResolvedValueOnce(0);
    await expect(
      service.suspend(actor('super_admin'), 'target', 'x'),
    ).rejects.toThrow(ConflictException);
  });

  it('suspension ends every session and clears the cached user', async () => {
    loadAs(target(null));
    await service.suspend(actor('support'), 'target', ' abuse ');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target' },
      data: { suspendedAt: expect.any(Date), suspendedReason: 'abuse' },
    });
    expect(tokens.endAllSessions).toHaveBeenCalledWith('target');
    expect(redis.invalidateUserCache).toHaveBeenCalledWith('target');
  });

  it('refuses to invite an existing account', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'someone' });
    await expect(
      service.invite(actor('super_admin'), {
        email: 'a@x.test',
        roleId: 'support',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('applies the escalation rule to invitations too', async () => {
    await expect(
      service.invite(actor('support'), {
        email: 'a@x.test',
        roleId: 'content_admin',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
