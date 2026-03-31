# Corpus Reconnaissance Analysis

Generated: 2026-03-31

## Executive Summary

The document corpus is **highly uniform and well-suited for automated processing**. All 375 PDFs contain extractable text (no scanned documents), follow consistent organizational policy formatting with numbered sections, and are predominantly short documents (median 8 pages). The estimated total token count is ~2.8M, making embedding costs negligible (~$0.06).

## Corpus Overview

| Metric | Value |
|--------|-------|
| Total PDFs | 375 |
| Total pages | 3,791 |
| Total file size | 62.9 MB |
| Extractable text | 375/375 (100%) |
| Parse errors | 0 |
| Estimated total tokens | ~2,815,000 |
| Estimated embedding cost | ~$0.06 |

### Category Distribution

| Category | Count | Description (inferred) |
|----------|-------|----------------------|
| GG | 144 | Largest category - clinical/care management policies |
| MA | 69 | Medical/administrative policies |
| HH | 47 | Home health / hospice policies |
| PA | 38 | Prior authorization policies |
| FF | 24 | Financial / fiscal policies |
| AA | 19 | Administrative / organizational policies |
| EE | 12 | Enrollment / eligibility policies |
| DD | 11 | Data / documentation policies |
| GA | 5 | General administration policies |
| CMC | 4 | Cal MediConnect policies |
| **input** | **2** | **Example regulatory documents** |

### Page Count Distribution

| Range | Count | % |
|-------|-------|---|
| 3-10 pages | 252 | 67% |
| 11-50 pages | 121 | 32% |
| 51+ pages | 2 | <1% |

- **Min**: 3 pages
- **Max**: 145 pages (Hard example input doc)
- **Median**: 8 pages
- **Mean**: 10.1 pages

## Document Type Taxonomy

The spot-check (32 sampled documents classified by GPT-4o-mini) reveals a remarkably homogeneous corpus:

### Type 1: Organizational Policy (97% of corpus)
- **Structure**: Numbered sections with headers
- **Content**: Policy statements, procedures, definitions, responsibilities
- **Complexity**: Moderate (multi-section) to complex (comprehensive)
- **Requirement density**: Medium to high ("must", "shall" language)
- **Extraction quality**: Clean text, no concerns
- **Example**: `GG.1100_CEO20250129_v20241231.pdf` - 15 pages, numbered sections

### Type 2: Regulatory Form (input docs only)
- **Structure**: Mixed - tables, checkboxes, form fields
- **Content**: Compliance review checklists
- **Complexity**: Moderate
- **Extraction concerns**: Has form elements, but text still extractable
- **Example**: `Example Input Doc - Easy.pdf` - 14 pages, 64 yes/no requirements

### Type 3: Narrative Regulatory Guide (input docs only)
- **Structure**: Numbered sections with dense prose
- **Content**: Policy guidance with embedded requirements
- **Complexity**: Complex/comprehensive
- **Extraction concerns**: Ellipsis characters detected (cosmetic, not functional)
- **Example**: `Example Input Doc - Hard.pdf` - 145 pages

## Text Extraction Quality

### Findings
- **100% text extractable**: No scanned documents, no OCR needed
- **No garbled text in policy corpus**: Only the Hard input doc has non-ASCII characters (ellipsis `…`), which is cosmetic
- **No empty pages**: All tested documents have text on every page
- **No multi-column layouts**: All documents appear to be single-column
- **Clean extraction**: 30 of 32 sampled docs classified as "clean text"

### Repeated Patterns (Headers/Footers)
- The Easy input doc has repeated headers: "Rev. 08/2023" (14 occurrences across 14 pages)
- Some policy docs have repeated section headers (e.g., "Performance", "Term Definition")
- **Recommendation**: Optional header/footer cleaning. Since these are typically short strings and won't meaningfully affect embeddings or search quality, cleaning is low priority. Can be addressed if retrieval quality is poor.

### Extraction Performance
- Small docs (3-4 pages): 23-26ms
- Medium docs (37-45 pages): 300-550ms
- Large docs (72-145 pages): 550-1700ms
- **Estimated full corpus extraction time**: ~30-60 seconds sequential

## Chunking Strategy Recommendations

Given the corpus characteristics:

1. **Chunk size**: ~500 tokens with ~100 token overlap
   - Rationale: Most docs are short (median 8 pages, ~1,000-2,000 tokens per page). 500-token chunks will create ~2-4 chunks per page, giving good granularity for search.
   - Estimated total chunks: ~5,600-11,200

2. **Chunk boundaries**: Split on paragraph/section boundaries where possible, fall back to token count
   - The numbered section structure of policy docs provides natural breakpoints

3. **Page tracking**: Store page number with each chunk for evidence citations
   - pdf-parse v2 provides per-page text via `result.pages[]`

4. **No OCR needed**: Skip entirely - 100% text extractable

5. **No special handling needed**: The corpus is uniform enough that a single chunking strategy will work for all documents

## Estimated Processing Budget

| Step | Per-doc cost | Total corpus |
|------|-------------|--------------|
| Text extraction | Free (local) | ~45 seconds |
| Embedding (text-embedding-3-small) | $0.02/1M tokens | ~$0.06 |
| Requirement extraction (Opus) | Variable | Per regulatory doc only |
| Evidence matching (Opus) | Variable | Per requirement |

The policy corpus processing (extraction + embedding) is extremely cheap and fast. The expensive operations are requirement extraction and evidence matching, which only run on regulatory input documents.

## Recommendations for Architecture

1. **Single pipeline, no special cases**: All 375 policy docs can be processed identically
2. **Process all categories**: No reason to subset - embedding is cheap and fast
3. **pdf-parse v2 is sufficient**: Clean extraction with per-page text support
4. **No text cleaning required**: Headers/footers are minimal and won't affect retrieval quality
5. **Priority categories for testing**: GG (144 docs, likely contains hospice/care management), HH (47 docs, home health), PA (38 docs, prior auth) - these are most likely to match the Easy example's hospice requirements
