import path from "path";

export const DATA_DIR = process.env.DATA_DIR || "/var/data";
export const DB_PATH = path.join(DATA_DIR, "db", "app.sqlite");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const REGULATORY_DIR = path.join(UPLOADS_DIR, "regulatory");
export const POLICIES_DIR = path.join(UPLOADS_DIR, "policies");
export const PROCESSING_DIR = path.join(DATA_DIR, "processing");
