import fs from "fs";
import {
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  REGULATORY_DIR,
  POLICIES_DIR,
  PROCESSING_DIR,
} from "./config";
import path from "path";

const dirs = [
  path.dirname(DB_PATH), // DATA_DIR/db
  UPLOADS_DIR,
  REGULATORY_DIR,
  POLICIES_DIR,
  PROCESSING_DIR,
];

export function ensureDirs() {
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
