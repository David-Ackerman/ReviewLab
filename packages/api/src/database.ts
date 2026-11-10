import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Value = SQLInputValue;
type Rows = { count?: number } & Record<string, unknown>[];

export async function openDatabase(dataDir: string) {
  const url = process.env.DATABASE_URL;
  if (process.env.VERCEL === '1' && !url) throw new Error('Configure DATABASE_URL para publicar na Vercel.');
  let query: (statement: string, values: Value[]) => Rows | PromiseLike<Rows>;
  let transaction: <T>(work: () => Promise<T>) => Promise<T>;

  if (url) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url, {
      max: 1,
      prepare: false,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
      connect_timeout: 10,
      idle_timeout: 20,
      onnotice: () => {},
      types: { integer64: { to: 20, from: [20], serialize: String, parse: Number } },
    });
    const context = new AsyncLocalStorage<{ unsafe: typeof sql.unsafe }>();
    query = (statement, values) => {
      let index = 0;
      const client = context.getStore() || sql;
      return client.unsafe(statement.replace(/\?/g, () => '$' + ++index), values as Parameters<typeof sql.unsafe>[1]);
    };
    transaction = async work => await sql.begin(async client => {
      await client`SELECT pg_advisory_xact_lock(734292018)`;
      return await context.run(client, work);
    }) as Awaited<ReturnType<typeof work>>;
  } else {
    mkdirSync(dataDir, { recursive: true });
    const sqlite = new DatabaseSync(join(dataDir, 'app.sqlite'));
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL');
    const context = new AsyncLocalStorage<true>();
    let tail = Promise.resolve();
    const exclusive = <T>(work: () => T | Promise<T>) => {
      const current = tail.then(work);
      tail = current.then(() => {}, () => {});
      return current;
    };
    function execute(statement: string, values: Value[]): Rows {
      const compiled = sqlite.prepare(statement);
      if (compiled.columns().length) return compiled.all(...values);
      return Object.assign([], { count: Number(compiled.run(...values).changes) });
    }
    query = (statement, values) => context.getStore() ? execute(statement, values) : exclusive(() => execute(statement, values));
    transaction = work => exclusive(() => context.run(true, async () => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await work();
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }));
  }

  async function all<T>(statement: string, ...values: Value[]): Promise<T[]> {
    return await query(statement, values) as T[];
  }
  async function get<T>(statement: string, ...values: Value[]): Promise<T | undefined> {
    return (await all<T>(statement, ...values))[0];
  }
  async function run(statement: string, ...values: Value[]) {
    return { changes: (await query(statement, values)).count ?? 0 };
  }
  async function exec(source: string) {
    for (const statement of source.split(';').map(part => part.trim()).filter(Boolean)) await run(statement);
  }
  async function addColumn(table: string, column: string, definition: string) {
    if (url) await exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    else if (!(await all<{ name: string }>('PRAGMA table_info(' + table + ')')).some(field => field.name === column)) {
      await exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  async function protectTables(...tables: string[]) {
    if (url) await exec(tables.map(table => 'ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY').join(';'));
  }
  return { postgres: Boolean(url), all, get, run, exec, transaction, addColumn, protectTables };
}

export type Database = Awaited<ReturnType<typeof openDatabase>>;
