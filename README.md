# Readily Compliance Auditor

A compliance policy browser for healthcare organizations. Built as a take-home project for [Readily](https://readily.codes).

**Live:** [readily.codes](https://readily.codes)

## The Problem

Healthcare organizations must demonstrate compliance with regulatory requirements issued by agencies like DHCS (California Department of Health Care Services). They regularly audit their internal policies against these regulatory documents and provide excerpts as evidence of compliance.

Today this is manual. An auditor reads a regulatory document, extracts each requirement, then digs through hundreds of organizational policy PDFs to find evidence that each requirement is met. For a single 14-page regulatory document with 64 requirements against a corpus of 375 policy documents, this takes days.

## What This App Does

The app automates this process with AI:

1. **Ingests regulatory documents** and extracts structured requirements using Claude Opus
2. **Ingests organizational policy documents** (375 PDFs across 10 categories), chunks them, and creates semantic embeddings
3. **Matches evidence**: for each requirement, searches the policy corpus for relevant text, then uses Claude to evaluate whether the evidence satisfies the requirement
4. **Presents results** in a browseable compliance dashboard with evidence drilldown
5. **Provides a chat interface** for exploring compliance gaps, searching policies, and uploading new regulatory documents

### The Compliance Browser

- Document sidebar listing all regulatory documents with compliance summaries
- Requirements dashboard with status badges (met / partial / not met / unclear)
- Evidence drilldown showing which policies satisfy each requirement, with excerpts and AI reasoning
- Policy explorer for browsing the organizational policy corpus by category

### The Chat Interface

- Ask questions about compliance gaps, specific requirements, or policies
- Semantic search across all policy documents
- Upload new regulatory documents for analysis

## Tech Stack

- **Next.js 16** (App Router, React 19.2)
- **SQLite** with vector search (sqlite-vector) for semantic similarity
- **Claude Opus 4.6** for requirement extraction and evidence evaluation
- **OpenAI GPT-5.4-mini** for the chat interface
- **OpenAI text-embedding-3-small** for embeddings
- **Tailwind CSS v4** + shadcn/ui

## Setup

```bash
npm install
cp .env.example .env  # Add your API keys
```

### Seed the Database

```bash
# Ingest all policy documents and example regulatory docs
npx tsx scripts/seed.ts
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key (for ingestion pipeline) |
| `OPENAI_API_KEY` | Yes | OpenAI API key (for embeddings + chat) |
| `DATA_DIR` | No | Persistent storage path (default: `/var/data`) |

## Deployment

Hosted on [Render.com](https://render.com) with a persistent disk at `/var/data`. Deploys automatically on push to main.
