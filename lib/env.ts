import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

// Force-load .env values, overriding any existing env vars.
// This is necessary because the task runner blanks ANTHROPIC_API_KEY
// to force claude CLI to use the logged-in account, but that also
// blanks it for any subprocess that needs the real key.
const envPath = resolve(__dirname, "../.env");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = value;
  }
} catch {
  // .env doesn't exist (e.g., production) - fall through to normal dotenv
  dotenv.config();
}
