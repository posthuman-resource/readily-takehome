import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { load } from "sqlite-vec";
import { DB_PATH } from "../config";
import { ensureDirs } from "../ensure-dirs";
import * as schema from "./schema";

ensureDirs();

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
load(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
