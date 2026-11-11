import type { Database } from './database.ts';

export async function migrate(db: Database) {
  await db.transaction(async () => {
    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, platforms TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      description TEXT NOT NULL, url TEXT NOT NULL, instructions TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('dev','review','prod')),
      requested_at TEXT, cover ${db.postgres ? 'BYTEA' : 'BLOB'}, cover_type TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id), feedback TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES reviews(id),
      title TEXT NOT NULL, observed TEXT NOT NULL, expected TEXT NOT NULL,
      steps TEXT NOT NULL, environment TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','working','fixed','unreproduced')),
      evidence ${db.postgres ? 'BYTEA' : 'BLOB'}, evidence_type TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_events (
      id ${db.postgres ? 'BIGSERIAL' : 'INTEGER'} PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id),
      actor_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tickets_review ON tickets(review_id);
    CREATE INDEX IF NOT EXISTS events_ticket ON ticket_events(ticket_id);
    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id),
      position INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, bytes ${db.postgres ? 'BYTEA' : 'BLOB'} NOT NULL,
      UNIQUE(ticket_id, position)
    );
  `);
    await db.addColumn('users', 'announcement_emails', 'INTEGER NOT NULL DEFAULT 0 CHECK(announcement_emails IN (0,1))');
    await db.addColumn('projects', 'platform', "TEXT NOT NULL DEFAULT 'web' CHECK(platform IN ('web','android','ios'))");
    await db.addColumn('projects', 'platforms', 'TEXT');
    await db.run(`UPDATE projects SET platforms = '["' || platform || '"]' WHERE platforms IS NULL`);
    await db.addColumn('tickets', 'retest_request_id', 'TEXT');
    await db.addColumn('projects', 'cover_path', 'TEXT');
    await db.addColumn('ticket_attachments', 'storage_path', 'TEXT');
    await db.protectTables('users', 'sessions', 'projects', 'reviews', 'tickets', 'ticket_events', 'ticket_attachments');
  });
}
