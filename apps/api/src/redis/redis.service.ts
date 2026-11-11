import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Mock Redis client for development
class MockRedis {
  private data: Map<string, { score: number; member: string }[]> = new Map();
  private strings: Map<string, { value: string; expiresAt: number }> =
    new Map();
  private counters: Map<string, { count: number; expiresAt: number }> =
    new Map();

  async set(
    key: string,
    value: string,
    mode?: 'EX',
    ttlSeconds?: number,
  ): Promise<string> {
    const expiresAt =
      mode === 'EX' && ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
    this.strings.set(key, { value, expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.strings.get(key);
    if (entry) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.strings.delete(key);
      } else {
        return entry.value;
      }
    }

    const counter = this.counters.get(key);
    if (counter) {
      if (counter.expiresAt !== 0 && Date.now() > counter.expiresAt) {
        this.counters.delete(key);
      } else {
        return String(counter.count);
      }
    }

    return null;
  }

  async del(key: string): Promise<number> {
    // Counters live in their own map; without clearing it, attempt counters
    // (email verification, sign-in codes, 2FA) never reset after success
    const removed =
      Number(this.strings.delete(key)) + Number(this.counters.delete(key));
    return removed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.strings.has(key) || this.counters.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const entry = this.counters.get(key);
    if (!entry || (entry.expiresAt !== 0 && Date.now() > entry.expiresAt)) {
      this.counters.set(key, { count: 1, expiresAt: 0 });
      return 1;
    }
    entry.count++;
    return entry.count;
  }

  async decrNotBelowZero(key: string): Promise<number> {
    const entry = this.counters.get(key);
    if (!entry || entry.count <= 0) return 0;
    entry.count--;
    return entry.count;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.counters.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      return 1;
    }
    const strEntry = this.strings.get(key);
    if (strEntry) {
      strEntry.expiresAt = Date.now() + ttlSeconds * 1000;
      return 1;
    }
    return 0;
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    const members = this.data.get(key) || [];
    const newMembers = members.filter(
      (item) => item.score < min || item.score > max,
    );
    const removed = members.length - newMembers.length;
    this.data.set(key, newMembers);
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.data.get(key)?.length || 0;
  }

  async zadd(key: string, ...args: any[]): Promise<number> {
    const members = this.data.get(key) || [];
    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = args[i + 1];
      const existingIndex = members.findIndex((item) => item.member === member);
      if (existingIndex >= 0) {
        members[existingIndex].score = score;
      } else {
        members.push({ score, member });
        added++;
      }
    }
    this.data.set(key, members);
    return added;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    const entry = this.counters.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + milliseconds;
      return 1;
    }
    return 0;
  }

  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.counters.get(key);
    if (!entry || (entry.expiresAt !== 0 && now > entry.expiresAt)) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    entry.count++;
    return entry.count;
  }

  async eval(script: string, numkeys: number, ...args: any[]): Promise<any> {
    // If eval is called on mock for incrWithExpiry
    if (script.includes('INCR') && args.length >= 2) {
      const key = String(args[0]);
      const ttl = Number(args[1]);
      return this.incrWithExpiry(key, ttl);
    }
    return 1;
  }

  async quit(): Promise<void> {
    this.data.clear();
    this.counters.clear();
    this.strings.clear();
  }

  async flushdb(): Promise<string> {
    this.data.clear();
    this.counters.clear();
    this.strings.clear();
    return 'OK';
  }
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | MockRedis;
  private useMock = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (nodeEnv === 'production' && !redisUrl) {
      throw new Error(
        'REDIS_URL must be set in production. In-memory mock Redis is strictly disallowed in production.',
      );
    }

    const useMock =
      nodeEnv === 'development' || nodeEnv === 'test' || !redisUrl;

    if (useMock) {
      this.useMock = true;
      this.client = new MockRedis();
      this.logger.log(
        'Using mock Redis client (development mode or no REDIS_URL provided)',
      );
    } else {
      this.client = new Redis(redisUrl);
    }
  }

  async onModuleDestroy() {
    if (this.client && !this.useMock) {
      await (this.client as Redis).quit();
    }
  }

  /** Get a string value by key. Returns null if not found or expired. */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Set a string value with optional TTL in seconds. */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** Delete a key. Returns the number of keys removed. */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Atomically increment a counter and set its TTL (only on first increment).
   * Executes via an atomic Lua script to eliminate race conditions.
   * Returns the new count value.
   */
  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    if (this.useMock) {
      return (this.client as MockRedis).incrWithExpiry(key, ttlSeconds);
    }

    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const result = await (this.client as Redis).eval(
      script,
      1,
      key,
      ttlSeconds,
    );
    return Number(result);
  }

  /**
   * Atomically give back one unit of a counter, never going below zero.
   * Used to refund quota when the work the counter was charged for failed.
   * Leaves the existing TTL untouched.
   */
  async decrNotBelowZero(key: string): Promise<number> {
    if (this.useMock) {
      return (this.client as MockRedis).decrNotBelowZero(key);
    }

    const script = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      if current <= 0 then
        return 0
      end
      return redis.call('DECR', KEYS[1])
    `;
    const result = await (this.client as Redis).eval(script, 1, key);
    return Number(result);
  }

  /** Check if a key exists. */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /** Invalidate the JWT user cache for a given user ID. */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.del(`jwt-user:${userId}`);
  }

  /** Flush all keys (test cleanup only). */
  async flushAll(): Promise<void> {
    if (this.useMock) {
      (this.client as MockRedis).quit();
    } else {
      await (this.client as Redis).flushdb();
    }
  }

  getClient(): Redis | MockRedis {
    return this.client;
  }
}
