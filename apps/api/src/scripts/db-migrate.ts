import { initializeDatabase } from '../db/client.js';

async function run() {
  const result = await initializeDatabase();
  console.log(`Runtime SQLite database initialized at ${result.path}.`);
}

void run();
