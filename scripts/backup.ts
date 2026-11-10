import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = resolve(process.env.DATA_DIR || process.env.WEENY_DATA_DIR || 'data');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dataDir, 'backups', 'reviewlab-' + stamp + '.sqlite');

const db = new DatabaseSync(resolve(dataDir, 'app.sqlite'), { readOnly: true });
try {
  mkdirSync(dirname(destination), { recursive: true });
  db.exec('PRAGMA busy_timeout = 5000');
  db.prepare('VACUUM INTO ?').run(destination);
  console.log(destination);
} finally {
  db.close();
}
