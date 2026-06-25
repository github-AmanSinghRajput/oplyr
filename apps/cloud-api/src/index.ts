import { closeDatabasePool } from './db/client.js';
import { createApp } from './app/createApp.js';
import { env, validateEnv } from './config/env.js';
import { logger } from './lib/logger.js';

async function start() {
  validateEnv();
  const { app } = createApp();

  const server = app.listen(env.port, env.host, () => {
    logger.info('cloud.ready', {
      port: env.port,
      host: env.host,
      origin: env.allowedOrigin
    });
  });

  const shutdown = async () => {
    logger.info('cloud.shutdown.requested');
    server.close();
    await closeDatabasePool();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void start();
