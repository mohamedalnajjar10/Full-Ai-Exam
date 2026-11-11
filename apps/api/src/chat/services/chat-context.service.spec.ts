import { Test, TestingModule } from '@nestjs/testing';
import { ChatMessageRole } from '@prisma/client';
import { ChatContextService } from './chat-context.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ChatContextService', () => {
  let service: ChatContextService;
  let prisma: {
    chatSession: { findUniqueOrThrow: jest.Mock };
    chatMessage: { findMany: jest.Mock };
  };

  const branch = { id: 'b1', name: 'علمي', createdAt: new Date() };
  const subject = {
    id: 's1',
    name: 'رياضيات',
    branchId: 'b1',
    bookPdfKey: null,
    bookPdfOriginalName: null,
    bookPdfSize: null,
    createdAt: new Date(),
    branch,
  };

  beforeEach(async () => {
    prisma = {
      chatSession: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'sess-1', subjectId: 's1', subject }),
      },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChatContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ChatContextService);
  });

  // ChatService used to re-query the session twice more per message because
  // the context did not expose it. These two fields are what let those
  // duplicate fetches go away — if they regress, the N+1 comes back silently.
  it('exposes the session subject so callers need not re-query it', async () => {
    const context = await service.assembleContext('sess-1');

    expect(context.subjectId).toBe('s1');
    expect(context.subject).toEqual(subject);
    expect(context.subjectName).toBe('رياضيات');
    expect(context.branchName).toBe('علمي');
    expect(prisma.chatSession.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic branch name when the subject has none', async () => {
    prisma.chatSession.findUniqueOrThrow.mockResolvedValue({
      id: 'sess-1',
      subjectId: 's1',
      subject: { ...subject, branch: null },
    });

    const context = await service.assembleContext('sess-1');

    expect(context.branchName).toBe('General');
  });

  it('returns history oldest-first and drops SYSTEM messages', async () => {
    // the query orders newest-first, so this is reverse-chronological
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        role: ChatMessageRole.ASSISTANT,
        type: 'TEXT',
        content: 'second',
        metadata: null,
        createdAt: new Date('2026-01-02'),
      },
      {
        role: ChatMessageRole.SYSTEM,
        type: 'TEXT',
        content: 'hidden',
        metadata: null,
        createdAt: new Date('2026-01-01T12:00:00'),
      },
      {
        role: ChatMessageRole.STUDENT,
        type: 'TEXT',
        content: 'first',
        metadata: null,
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const context = await service.assembleContext('sess-1');

    expect(context.messages.map((m) => m.parts[0].text)).toEqual([
      'first',
      'second',
    ]);
    expect(context.messages.map((m) => m.role)).toEqual(['user', 'model']);
  });

  it('bounds the history it loads', async () => {
    await service.assembleContext('sess-1');

    const call = prisma.chatMessage.findMany.mock.calls[0][0];
    expect(call.take).toBeGreaterThan(0);
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
