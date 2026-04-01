import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { load } from "sqlite-vec";
import { DB_PATH } from "../config";
import { ensureDirs } from "../ensure-dirs";
import * as schema from "./schema";

// Lazy initialization: the persistent disk isn't mounted during `next build`
// on Render.com, so we must not open the database at import time.
let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

function init() {
  if (!_db) {
    ensureDirs();
    _sqlite = new Database(DB_PATH);
    _sqlite.pragma("journal_mode = WAL");
    load(_sqlite);
    _db = drizzle(_sqlite, { schema });
  }
  return { db: _db, sqlite: _sqlite! };
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_, prop) {
    const target = init().db;
    const value = (target as any)[prop];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export const sqlite = new Proxy({} as Database.Database, {
  get(_, prop) {
    const target = init().sqlite;
    const value = (target as any)[prop];
    return typeof value === "function" ? value.bind(target) : value;
  },
});
