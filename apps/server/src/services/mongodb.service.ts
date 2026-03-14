import { Collection, Db, Document, MongoClient } from 'mongodb';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class MongoDBService {
  private static instance: MongoDBService;
  private client: MongoClient;
  private db: Db | null = null;

  private constructor() {
    this.client = new MongoClient(config.mongoDB.uri);
  }

  static getInstance(): MongoDBService {
    if (!MongoDBService.instance) {
      MongoDBService.instance = new MongoDBService();
    }
    return MongoDBService.instance;
  }

  async connect(): Promise<void> {
    if (this.db) {
      return;
    }

    await this.client.connect();
    this.db = this.client.db(config.mongoDB.database);
    logger.info(`Mongo connected to ${config.mongoDB.database}`);
    await this.ensureBaseIndexes();
  }

  async disconnect(): Promise<void> {
    if (!this.db) {
      return;
    }

    await this.client.close();
    this.db = null;
  }

  collection<T extends Document = Document>(name: string): Collection<T> {
    if (!this.db) {
      throw new Error('MongoDB is not connected');
    }
    return this.db.collection<T>(name);
  }

  private async ensureBaseIndexes(): Promise<void> {
    try {
      await this.collection('studio_flows').createIndex(
        { ownerUserId: 1, ownerTenantId: 1, updatedAt: -1 },
        { background: true }
      );
      await this.collection('studio_flows').createIndex(
        { 'webhook.id': 1 },
        {
          unique: true,
          background: true,
          partialFilterExpression: { 'webhook.id': { $exists: true } },
        }
      );
      await this.collection('studio_flow_runs').createIndex(
        { flowId: 1, ownerUserId: 1, ownerTenantId: 1, startedAt: -1 },
        { background: true }
      );
      await this.collection('studio_flow_runs').createIndex({ id: 1 }, { unique: true, background: true });
      await this.collection('studio_flow_history').createIndex(
        { flowId: 1, ownerUserId: 1, ownerTenantId: 1, createdAt: -1 },
        { background: true }
      );
      await this.collection('studio_flow_history').createIndex({ id: 1 }, { unique: true, background: true });
      await this.collection('studio_sessions').createIndex({ id: 1 }, { unique: true, background: true });
      await this.collection('studio_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });
      await this.collection('studio_artifacts').createIndex({ flowId: 1, createdAt: -1 }, { background: true });
    } catch (error) {
      logger.warn('Mongo index ensure warning:', error);
    }
  }
}
