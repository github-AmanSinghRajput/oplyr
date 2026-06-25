import { checkDatabaseConnection } from '../../db/client.js';

export class SystemService {
  getReadiness() {
    return checkDatabaseConnection().then((database) => ({
      ready: database.reachable,
      database
    }));
  }
}
