import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Subject, Observable, interval, merge } from 'rxjs';
import { filter, map, concatMap } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

export const PARENT_SSE_CHANNEL = 'masar:parent:sse:events';

export interface ParentLiveEvent {
  studentId: string;
  eventType: string;
  title: string;
  data: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class ParentRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParentRealtimeService.name);
  private readonly liveEvent$ = new Subject<ParentLiveEvent>();
  private readonly instanceId = randomUUID();
  private pubClient?: Redis;
  private subClient?: Redis;

  /**
   * ذاكرة كاش قصيرة الأمد (30 ثانية) لفحص صلاحية ارتباط ولي الأمر بالطالب،
   * لتجنب الاستعلام المتكرر المرهق لقاعدة البيانات عند تدفق أحداث نشاط الطالب.
   */
  private readonly linkValidityCache = new Map<
    string,
    { isValid: boolean; expiresAt: number }
  >();

  /** مدة صلاحية الكاش بالمللي ثانية (30 ثانية) */
  private static readonly LINK_CACHE_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl =
      this.configService?.get<string>('REDIS_URL') ?? process.env.REDIS_URL;

    if (!redisUrl) {
      this.logger.debug(
        'REDIS_URL not configured. Parent SSE runs in single-instance memory mode.',
      );
      return;
    }

    try {
      this.pubClient = new Redis(redisUrl, { lazyConnect: true });
      this.subClient = new Redis(redisUrl, { lazyConnect: true });

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      await this.subClient.subscribe(PARENT_SSE_CHANNEL);

      this.subClient.on('message', (channel, message) => {
        if (channel !== PARENT_SSE_CHANNEL) return;
        try {
          const parsed = JSON.parse(message);
          // Only process events originating from other instances
          if (parsed.instanceId !== this.instanceId) {
            const { instanceId: _, ...event } = parsed;
            this.liveEvent$.next(event);
          }
        } catch (err: any) {
          this.logger.warn(
            `Failed to parse cross-instance SSE message: ${err.message}`,
          );
        }
      });

      this.logger.log(
        `[Realtime SSE] Connected to Redis Pub/Sub channel "${PARENT_SSE_CHANNEL}" for multi-instance scaling.`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to connect Redis Pub/Sub for SSE; running in local memory mode: ${err.message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.subClient) {
        await this.subClient
          .unsubscribe(PARENT_SSE_CHANNEL)
          .catch(() => undefined);
        this.subClient.disconnect();
      }
      if (this.pubClient) {
        this.pubClient.disconnect();
      }
    } catch {
      // Ignore disconnect errors
    }
  }

  /**
   * Broadcast an activity event to any active parent streams
   */
  emitStudentEvent(
    studentId: string,
    eventType: string,
    title: string,
    data: Record<string, any>,
  ): void {
    const payload: ParentLiveEvent = {
      studentId,
      eventType,
      title,
      data,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `[Realtime SSE] Broadcasting event for student ${studentId}: [${eventType}] "${title}"`,
    );

    // 1. Emit to local instance subscribers
    this.liveEvent$.next(payload);

    // 2. Broadcast across cluster via Redis Pub/Sub (ARC-01)
    if (this.pubClient && this.pubClient.status === 'ready') {
      this.pubClient
        .publish(
          PARENT_SSE_CHANNEL,
          JSON.stringify({ instanceId: this.instanceId, ...payload }),
        )
        .catch((err) => {
          this.logger.warn(
            `Failed to publish SSE event to Redis: ${err.message}`,
          );
        });
    }
  }

  /**
   * Creates an SSE Observable stream for a parent.
   * If studentId is passed, only events for that student are streamed.
   * Otherwise, events for all actively linked children of this parent are streamed.
   */
  async createParentStudentStream(
    parentId: string,
    studentId?: string,
  ): Promise<Observable<MessageEvent>> {
    // 1. Fetch actively linked student IDs for this parent
    const links = await this.prisma.parentStudentLink.findMany({
      where: {
        parentId,
        status: 'ACTIVE',
        ...(studentId ? { studentId } : {}),
      },
      select: { studentId: true },
    });

    const allowedStudentIds = new Set(links.map((l) => l.studentId));

    this.logger.log(
      `[Realtime SSE] Parent ${parentId} opened SSE stream. Tracking ${allowedStudentIds.size} linked student(s).`,
    );

    // 2. Stream actual student events with dynamic revocation check
    const eventStream$ = this.liveEvent$.asObservable().pipe(
      concatMap(async (event) => {
        if (!allowedStudentIds.has(event.studentId)) return null;

        // Verify active link is still valid in database (cached for 30s)
        const isStillValid = await this.isLinkActive(parentId, event.studentId);

        if (!isStillValid) {
          allowedStudentIds.delete(event.studentId);
          this.logger.warn(
            `[Realtime SSE] Dropped event for unlinked student ${event.studentId} for parent ${parentId}`,
          );
          return null;
        }

        return event;
      }),
      filter((event): event is ParentLiveEvent => event !== null),
      map((event): MessageEvent => ({
        type: 'STUDENT_ACTIVITY',
        data: JSON.stringify(event),
      })),
    );

    // 3. Keep-alive heartbeat every 25 seconds
    const heartbeat$ = interval(25_000).pipe(
      map((): MessageEvent => ({
        type: 'HEARTBEAT',
        data: JSON.stringify({
          type: 'HEARTBEAT',
          timestamp: new Date().toISOString(),
        }),
      })),
    );

    return merge(eventStream$, heartbeat$);
  }

  /**
   * التحقق من كون الربط بين ولي الأمر والطالب نشطاً مع الاستفادة من الكاش المؤقت (30 ثانية).
   */
  async isLinkActive(parentId: string, studentId: string): Promise<boolean> {
    const cacheKey = `${parentId}:${studentId}`;
    const now = Date.now();
    const cached = this.linkValidityCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.isValid;
    }

    const activeLink = await this.prisma.parentStudentLink.findFirst({
      where: {
        parentId,
        studentId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const isValid = !!activeLink;
    this.linkValidityCache.set(cacheKey, {
      isValid,
      expiresAt: now + ParentRealtimeService.LINK_CACHE_TTL_MS,
    });

    // تنظيف المدخلات المنتهية الصلاحية إذا تجاوز حجم الكاش 500 عنصر
    if (this.linkValidityCache.size > 500) {
      for (const [key, entry] of this.linkValidityCache.entries()) {
        if (entry.expiresAt <= now) {
          this.linkValidityCache.delete(key);
        }
      }
    }

    return isValid;
  }

  /**
   * إبطال الكاش فوراً عند فك الارتباط أو تغيير الحالة.
   */
  invalidateLinkCache(parentId: string, studentId?: string): void {
    if (studentId) {
      this.linkValidityCache.delete(`${parentId}:${studentId}`);
    } else {
      const prefix = `${parentId}:`;
      for (const key of this.linkValidityCache.keys()) {
        if (key.startsWith(prefix)) {
          this.linkValidityCache.delete(key);
        }
      }
    }
  }
}
