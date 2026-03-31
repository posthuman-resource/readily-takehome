/**
 * Task Runner: Reads task files from docs/init/ and executes them sequentially
 * via the Claude CLI. Tracks completion via git commit messages.
 *
 * Usage: npx tsx scripts/run-tasks.ts [--start-from NN] [--dry-run]
 */
import { execSync, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

const TASKS_DIR = path.resolve(__dirname, "../docs/init");
const PROJECT_ROOT = path.resolve(__dirname, "..");

interface TaskFile {
  number: string;
  name: string;
  filename: string;
  path: string;
  content: string;
}

function getTaskFiles(): TaskFile[] {
  const files = fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith(".md") && /^\d{2}-/.test(f))
    .sort();

  return files.map(filename => {
    const match = filename.match(/^(\d{2})-(.+)\.md$/);
    if (!match) throw new Error(`Invalid task filename: ${filename}`);
    return {
      number: match[1],
      name: match[2],
      filename,
      path: path.join(TASKS_DIR, filename),
      content: fs.readFileSync(path.join(TASKS_DIR, filename), "utf-8"),
    };
  });
}

function getCompletedTasks(): Set<string> {
  try {
    const log = execSync("git log --oneline --all", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    });
    const completed = new Set<string>();
    for (const line of log.split("\n")) {
      const match = line.match(/\[task-complete\]\s+(\d{2})-/);
      if (match) {
        completed.add(match[1]);
      }
    }
    return completed;
  } catch {
    return new Set();
  }
}

function buildPrompt(task: TaskFile): string {
  // Read the project overview for context
  const initMd = fs.readFileSync(path.join(PROJECT_ROOT, "docs/init.md"), "utf-8");
  const agentsMd = fs.existsSync(path.join(PROJECT_ROOT, "AGENTS.md"))
    ? fs.readFileSync(path.join(PROJECT_ROOT, "AGENTS.md"), "utf-8")
    : "";

  return `You are implementing a specific task in a larger project. Here is the context:

## Project Overview
${initMd}

## AGENTS.md (IMPORTANT - read this first)
${agentsMd}

## Your Task
${task.content}

## Instructions
1. Read the task carefully and understand what needs to be built
2. Implement everything described in the task
3. Verify ALL acceptance criteria listed at the bottom of the task
4. When all acceptance criteria pass, create a git commit with the message:
   [task-complete] ${task.number}-${task.name}

   Include a brief description of what was implemented after the first line.
5. Do NOT proceed to other tasks. Only implement THIS task.
6. If you need to look up API docs, use the context7 MCP tool.
7. If you need to understand Next.js 16 APIs, read the docs in node_modules/next/dist/docs/

IMPORTANT: Verify acceptance criteria BEFORE committing. Do not commit if criteria are not met.`;
}

async function runTask(task: TaskFile, dryRun: boolean): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Task ${task.number}: ${task.name}`);
  console.log(`${"=".repeat(60)}\n`);

  if (dryRun) {
    console.log("[DRY RUN] Would execute this task");
    console.log(`File: ${task.filename}`);
    console.log(`Content length: ${task.content.length} chars`);
    return true;
  }

  const prompt = buildPrompt(task);

  // Write prompt to a temp file to avoid shell escaping issues
  const tmpFile = path.join(PROJECT_ROOT, `.task-prompt-${task.number}.tmp`);
  fs.writeFileSync(tmpFile, prompt);

  return new Promise<boolean>((resolve) => {
    const child: ChildProcess = spawn(
      "claude",
      [
        "-p",
        "--model", "opus",
        "--effort", "max",
        "--dangerously-skip-permissions",
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: ["pipe", "inherit", "inherit"],
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: "",  // Force use of logged-in account
        },
      }
    );

    // Pipe the prompt via stdin
    child.stdin!.write(prompt);
    child.stdin!.end();

    // Handle SIGINT: forward to child
    const sigintHandler = () => {
      console.log("\nForwarding SIGINT to claude process...");
      child.kill("SIGINT");
    };
    process.on("SIGINT", sigintHandler);

    child.on("close", (code) => {
      process.removeListener("SIGINT", sigintHandler);

      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch {}

      if (code === 0) {
        // Verify the task was committed
        const completed = getCompletedTasks();
        if (completed.has(task.number)) {
          console.log(`\nTask ${task.number} completed successfully.`);
          resolve(true);
        } else {
          console.log(`\nTask ${task.number} exited successfully but no commit found.`);
          console.log("The task may need to be re-run.");
          resolve(false);
        }
      } else {
        console.log(`\nTask ${task.number} exited with code ${code}`);
        resolve(false);
      }
    });

    child.on("error", (err) => {
      process.removeListener("SIGINT", sigintHandler);
      console.error(`Error running task ${task.number}:`, err.message);
      try { fs.unlinkSync(tmpFile); } catch {}
      resolve(false);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const startFromArg = args.find(a => a.startsWith("--start-from"));
  const startFrom = startFromArg
    ? args[args.indexOf(startFromArg) + 1]
    : undefined;

  const tasks = getTaskFiles();
  const completed = getCompletedTasks();

  console.log("Readily Compliance Auditor - Task Runner");
  console.log(`Found ${tasks.length} tasks`);
  console.log(`Completed: ${completed.size} (${[...completed].sort().join(", ") || "none"})`);

  if (dryRun) {
    console.log("\n[DRY RUN MODE - no tasks will be executed]\n");
  }

  let started = !startFrom;

  for (const task of tasks) {
    if (!started) {
      if (task.number === startFrom) {
        started = true;
      } else {
        console.log(`Skipping task ${task.number} (before --start-from ${startFrom})`);
        continue;
      }
    }

    if (completed.has(task.number)) {
      console.log(`Skipping task ${task.number} (already completed)`);
      continue;
    }

    const success = await runTask(task, dryRun);

    if (!success && !dryRun) {
      console.log(`\nTask ${task.number} did not complete. Stopping.`);
      console.log("Re-run this script to retry from this task.");
      process.exit(1);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("All tasks completed!");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
