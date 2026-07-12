import { env } from '../../config/env.js';
import { checkDatabaseConnection } from '../../db/client.js';
import { checkBrainDatabaseConnection } from '../../db/brain-client.js';

export class SystemService {
  async getBackendStatus() {
    const database = await checkDatabaseConnection();
    const brainDatabase = await checkBrainDatabaseConnection();

    return {
      environment: env.appEnv,
      database,
      brainDatabase,
      providers: {
        queue: env.queueProvider,
        email: env.emailProvider,
        vector: env.vectorProvider,
        rag: env.ragProvider,
        ocr: env.ocrProvider
      },
      recommendations: {
        queue: 'Use inline/background work now. Move to Redis-backed queues before Kafka.',
        vector: 'Use pgvector inside Postgres if semantic memory becomes necessary.',
        email: 'Use a simple provider like SendGrid or Resend before SNS/SQS complexity.',
        rag: 'Do not add RAG until notes or memory search has a clear product need.',
        ocr: 'Add OCR only when document ingestion becomes a real user workflow.'
      }
    };
  }

  async getReadiness() {
    const database = await checkDatabaseConnection();
    const brainDatabase = await checkBrainDatabaseConnection();
    const ready =
      (!database.configured || database.reachable) &&
      (!brainDatabase.configured || brainDatabase.reachable);

    return {
      ready,
      database,
      brainDatabase
    };
  }
}
