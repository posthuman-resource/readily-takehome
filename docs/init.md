# Readily Compliance Auditor - Implementation Plan

## Overview

A compliance policy browser for healthcare organizations. Users browse regulatory requirements, see which organizational policies satisfy them, and drill into evidence. Users can also upload new regulatory documents to expand the knowledge base.

## Architecture Summary

- **Next.js 16** (App Router, Turbopack, React 19.2)
- **Drizzle ORM + SQLite** (better-sqlite3) with **sqlite-vector** for embeddings
- **Claude Opus 4.6** for requirement extraction + evidence evaluation (ingestion pipeline)
- **OpenAI GPT-5.4-mini** for chat interface
- **OpenAI text-embedding-3-small** for policy chunk embeddings
- **pdf-parse v2** for PDF text extraction
- **shadcn/ui** + Tailwind CSS for UI
- **Render.com** deployment with persistent disk

## Corpus Reconnaissance Findings

See `docs/recon/corpus-analysis.md` for full details. Key findings:

- **375 PDFs**, all with extractable text (no OCR needed)
- **3,791 total pages**, median 8 pages per doc
- **~2.8M tokens** total, embedding cost ~$0.06
- All policy docs have numbered sections, clean text
- Uniform corpus - single chunking strategy works for all
- GG (144), MA (69), HH (47) are the largest categories

## Task Plan

| # | Task | Dependencies |
|---|------|-------------|
| 01 | [Project Setup](init/01-project-setup.md) | - |
| 02 | [Database Schema](init/02-database-schema.md) | 01 |
| 03 | [PDF Text Extraction Module](init/03-pdf-extraction.md) | 01 |
| 04 | [Vector Search Setup](init/04-vector-search.md) | 02 |
| 05 | [Policy Ingestion Pipeline](init/05-policy-ingestion.md) | 02, 03, 04 |
| 06 | [Requirement Extraction](init/06-requirement-extraction.md) | 02, 03 |
| 07 | [Evidence Matching](init/07-evidence-matching.md) | 04, 05, 06 |
| 08 | [Core Pipeline Orchestrator](init/08-pipeline-orchestrator.md) | 05, 06, 07 |
| 09 | [CLI Entry Points](init/09-cli-entry-points.md) | 08 |
| 10 | [API Entry Points (Ingest + SSE)](init/10-api-entry-points.md) | 08 |
| 11 | [Compliance Browser UI](init/11-compliance-browser.md) | 02, 09 |
| 12 | [Policy Explorer UI](init/12-policy-explorer.md) | 02 |
| 13 | [Chat Backend](init/13-chat-backend.md) | 04, 10 |
| 14 | [Chat Frontend](init/14-chat-frontend.md) | 13 |
| 15 | [End-to-End Integration](init/15-integration.md) | 09, 11, 14 |
| 16 | [Deploy Configuration](init/16-deploy-config.md) | 15 |

## Critical Path

1. **Project Setup** -> **Database + PDF extraction** -> **Policy Ingestion** -> **CLI Seed** -> **Browser UI**
2. The offline pipeline (tasks 1-9) is the foundation. The web app reads pre-computed data.
3. Deploy early (task 16 can start after task 11 is testable).

## Key Decisions (Informed by Recon)

- **Single chunking strategy**: ~500 token chunks with ~100 token overlap, split on section boundaries
- **No OCR**: All 375 docs have clean extractable text
- **No text cleaning needed**: Minimal headers/footers that won't affect retrieval
- **Process all categories**: Embedding is cheap ($0.06), no reason to subset
- **pdf-parse v2**: `PDFParse` class with `getText()` provides per-page text via `result.pages[]`
- **Priority test categories**: GG, HH, PA (most likely to match hospice requirements)
