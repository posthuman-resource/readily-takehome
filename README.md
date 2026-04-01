# Readily Compliance Auditor

**Live site:** [readily.codes](https://readily.codes)

## The Problem

Healthcare organizations must demonstrate compliance with regulatory requirements. Today, this means manually auditing internal policies against regulatory documents and pulling excerpts as evidence -- a tedious, error-prone process that can take days.

For example, a single regulatory submission review form might contain 64 individual requirements. For each one, a compliance officer needs to search through hundreds of organizational policy documents, find the relevant section, and pull a quote proving the requirement is met. Multiply that across every regulatory document an organization must comply with, and the scale of the problem becomes clear.

### The Assignment

Build a web app that:

1. Lets a user upload a regulatory document (PDF)
2. Transforms it into a list of requirements
3. For each requirement, shows whether it's met and surfaces the supporting evidence from organizational policies
4. **Stretch goal:** Handle a harder 145-page narrative document where requirements aren't neatly structured but buried in prose

## What We Built

We went beyond the ask. Instead of a simple upload-and-process tool, we built a **full compliance knowledge base** -- a pre-indexed, instantly browsable dashboard covering 375 organizational policy documents across 10 categories, with AI-powered analysis already complete before the user ever opens the app.

The expensive work (PDF parsing, requirement extraction, evidence matching) happens offline via an ingestion pipeline. By the time a user opens the app, all of the analysis is done and the interface reads from a pre-computed database. Everything loads instantly.

This approach also handles the stretch goal: the AI extracts requirements from long, unstructured narrative documents just as well as from clean, numbered lists -- no special handling needed.

## How This Was Built

This project was built almost entirely by Claude Code (Opus), working from a single detailed specification document ([`docs/primer.md`](docs/primer.md)).

The process worked like this:

1. **We wrote the primer.** A ~550-line spec describing the problem, the desired architecture, the data flow, the UI, and the deployment target. It also instructed Claude to do its own research before planning -- surveying the 375-PDF corpus, stress-testing extraction on edge cases, and analyzing document structure across all 10 categories.

2. **Claude researched and planned.** Given the primer, Claude Code first built and ran reconnaissance scripts against the entire document corpus (results in [`docs/recon/`](docs/recon/)). It discovered that all 375 PDFs had clean, extractable text with numbered sections -- no OCR needed, no special handling required. It then used those findings to create a 16-task implementation plan ([`docs/init.md`](docs/init.md)), with each task having detailed specs, dependencies, and concrete acceptance criteria.

3. **Claude built a task runner.** Before executing anything, Claude created [`scripts/run-tasks.ts`](scripts/run-tasks.ts) -- a script that reads the task files in order, checks git history for completed tasks (via `[task-complete]` commit messages), and feeds each remaining task to a fresh Claude Code instance. The runner is idempotent: stop it and restart, and it picks up where it left off.

4. **The task runner built the app.** We ran `npx tsx scripts/run-tasks.ts` and let it go. Each task spawned a Claude Code session that read the task spec, wrote the code, verified its own acceptance criteria, committed with a `[task-complete]` message, and moved on. The git history tells the story -- sequential `[task-complete]` commits, each one building on the last.

5. **We checked in a few times.** The process was mostly hands-off, but we course-corrected twice: once when Claude was writing mock tests instead of hitting real APIs, and once to manually run the ingestion pipeline when the evidence cross-referencing step took longer than expected. Both interventions are visible in the commit history.

The entire codebase -- database schema, PDF extraction, vector search, AI pipelines, Next.js frontend, chat interface, deployment config -- was written by Claude from that primer spec. The human role was authoring the spec, watching the commits roll in, and nudging when something looked off.

## What You Can Do With It

### Browse Compliance Results

The main view is a compliance dashboard. Pick a regulatory document from the sidebar to see all of its extracted requirements at a glance -- how many are met, partially met, not met, or unclear. A summary bar gives you the overall compliance picture in seconds.

### Drill Into Evidence

Click any requirement to expand it and see exactly which policy documents provide evidence. Each match shows the policy name, page number, the specific excerpt, and the AI's reasoning for its compliance determination. No more hunting through PDFs.

### Explore Policies

A separate Policy Explorer lets you browse the full corpus of 375 organizational policies by category (AA, CMC, DD, EE, FF, GA, GG, HH, MA, PA). You can search across all policies and see which regulatory requirements each policy satisfies -- a reverse lookup that's impossible to do manually at scale.

### Ask Questions

An AI chat assistant is available on every page. Ask it about specific requirements, policies, or compliance gaps. It has access to the full knowledge base, so it can query requirements, run semantic searches across policy text, and provide cited answers. Examples:

- "Which requirements are we failing on?"
- "Find policies about retrospective authorization timelines"
- "What are our highest-risk compliance gaps?"

### Upload New Documents

Drop a new regulatory PDF into the chat or use the upload endpoint. The system will extract requirements, match evidence, and add the results to the browsable dashboard -- with real-time progress updates.

## How It's Built

At a high level:

- A **Next.js** web application with server-rendered pages for instant load times
- **SQLite with vector search** as the knowledge base (policy text, embeddings, requirements, evidence)
- **Claude Opus** for the heavy AI work: extracting requirements from regulatory documents and evaluating whether policy excerpts satisfy them
- **OpenAI** for embeddings (making policy text searchable by meaning) and powering the chat interface
- **375 pre-indexed policy PDFs** across 10 categories, totaling ~3,800 pages

The full implementation plan is documented in [`docs/init.md`](docs/init.md), with individual task specs in [`docs/init/`](docs/init/).

## Running Locally

```bash
npm install
```

Set environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For the ingestion pipeline (Claude Opus) |
| `OPENAI_API_KEY` | For embeddings and the chat interface |
| `DATA_DIR` | Path to persistent storage (default: `/var/data`) |

Start the dev server:

```bash
npm run dev
```

The app will be available at [localhost:3000](http://localhost:3000).

## Deployment

Hosted on [Render.com](https://render.com) with a persistent disk. Deploys automatically on push to main.
