import { randomUUID } from 'crypto';
import { MongoDBService } from './mongodb.service.js';

export interface StudioSessionRecord {
  id: string;
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
  };
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionService {
  private static instance: SessionService;
  private mongodb: MongoDBService;

  private constructor() {
    this.mongodb = MongoDBService.getInstance();
  }

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  private collection() {
    return this.mongodb.collection<StudioSessionRecord>('studio_sessions');
  }

  async create(input: {
    user: StudioSessionRecord['user'];
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresInSeconds?: number;
  }): Promise<StudioSessionRecord> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(60, input.expiresInSeconds || 3600) * 1000);
    const doc: StudioSessionRecord = {
      id: `studio_session_${randomUUID()}`,
      user: input.user,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      idToken: input.idToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection().insertOne(doc as any);
    return doc;
  }

  async get(sessionId: string): Promise<StudioSessionRecord | null> {
    const record = await this.collection().findOne({ id: sessionId } as any);
    if (!record) {
      return null;
    }

    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      await this.delete(sessionId);
      return null;
    }

    return record;
  }

  async delete(sessionId: string): Promise<void> {
    await this.collection().deleteOne({ id: sessionId } as any);
  }

  async updateTokens(sessionId: string, updates: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresInSeconds?: number;
  }): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(60, updates.expiresInSeconds || 3600) * 1000);
    await this.collection().updateOne(
      { id: sessionId } as any,
      {
        $set: {
          accessToken: updates.accessToken,
          refreshToken: updates.refreshToken,
          idToken: updates.idToken,
          expiresAt,
          updatedAt: now,
        },
      }
    );
  }
}
