import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

export class RedisService {
  private static instance: RedisService;
  private client: Redis | null = null;
  private ready = false;

  private constructor() {}

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async connect(): Promise<void> {
    const url = String(config.redis.url || '').trim();
    if (!url) {
      logger.warn('Redis URL not configured; continuing without Redis cache');
      return;
    }

    if (this.client) {
      return;
    }

    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on('ready', () => {
      this.ready = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (error) => {
      this.ready = false;
      logger.warn('Redis error:', error instanceof Error ? error.message : error);
    });

    try {
      await this.client.connect();
      this.ready = true;
    } catch (error) {
      this.ready = false;
      logger.warn('Redis connect failed; cache disabled:', error instanceof Error ? error.message : error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.quit();
    } catch (_error) {
      // noop
    } finally {
      this.client = null;
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client || !this.ready) return null;

    const value = await this.client.get(this.withPrefix(key));
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (_error) {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.ready) return;

    const payload = JSON.stringify(value);
    const namespaced = this.withPrefix(key);

    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(namespaced, payload, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(namespaced, payload);
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.ready) return;
    await this.client.del(this.withPrefix(key));
  }

  private withPrefix(key: string): string {
    const prefix = String(config.redis.prefix || 'studio:');
    return `${prefix}${key}`;
  }
}
