import { checkDatabaseConnection } from '../db/client.js';
import { env } from '../config/env.js';

async function run() {
  const status = await checkDatabaseConnection();
  console.log(JSON.stringify(status, null, 2));
  if (env.appEnv === 'production' && !status.reachable) {
    process.exit(1);
  }
}

void run();
