# Task 03: PDF Text Extraction Module

## Objective

Create a reusable PDF text extraction module that takes a PDF file path and returns structured text with page numbers. This module is used by both the ingestion pipeline and the recon scripts.

## Details

### Important: Next.js 16

Read `node_modules/next/dist/docs/` before writing any code. This version has breaking changes.

### Module: `lib/pdf.ts`

The module should export a function:

```typescript
interface PageText {
  pageNumber: number;  // 1-indexed
  text: string;
}

interface ExtractedDocument {
  text: string;          // Full concatenated text
  pages: PageText[];     // Per-page text
  pageCount: number;
}

export async function extractPdfText(filePath: string): Promise<ExtractedDocument>
```

### Implementation Notes

**Use pdf-parse v2** (already installed, version 2.4.5). The API is:

```typescript
import { PDFParse } from 'pdf-parse';

const parser = new PDFParse({ url: absoluteFilePath });
const result = await parser.getText();
// result.text = full text (string)
// result.total = page count (number)
// result.pages = array of { text: string, num: number }
```

**Important**: The `url` parameter takes a file path (not a URL). It must be an absolute path.

### Corpus Characteristics (from recon)

Based on `docs/recon/corpus-analysis.md`:
- All 375 PDFs have extractable text (no OCR needed)
- Clean text output, no garbled characters in policy docs
- Some docs have repeated headers/footers but they're short strings
- Page count ranges from 3 to 145, median 8
- Extraction time: 23ms (small) to 1700ms (large)

### Error Handling

- If the PDF fails to parse, throw a descriptive error with the filename
- If text extraction returns empty text for a document that should have text, log a warning
- Do NOT crash the pipeline for a single bad PDF; the pipeline should handle errors at the document level

### Text Cleaning (Optional)

The recon found minimal issues. Only implement cleaning if it causes retrieval problems later:
- Strip excessive whitespace (multiple blank lines -> single blank line)
- Normalize Unicode characters (e.g., smart quotes -> regular quotes)

## Acceptance Criteria

- `npx tsx -e "import { extractPdfText } from './lib/pdf'; extractPdfText('$(pwd)/data/Example Input Doc - Easy.pdf').then(r => { console.log('Pages:', r.pageCount); console.log('Text length:', r.text.length); console.log('First page:', r.pages[0].text.slice(0, 200)) })"` prints page count (14), text length (~29805), and first page text
- `npx tsx -e "import { extractPdfText } from './lib/pdf'; extractPdfText('$(pwd)/data/Example Input Doc - Hard.pdf').then(r => console.log('Pages:', r.pageCount, 'Chars:', r.text.length))"` prints page count (145) and char count (~282865)
- Test with a small policy doc: `npx tsx -e "import { extractPdfText } from './lib/pdf'; extractPdfText('$(pwd)/data/Public Policies/PA/PA.5052_20250221.pdf').then(r => console.log('Pages:', r.pageCount, 'Chars:', r.text.length))"` succeeds
- The module handles errors gracefully (test with a non-existent file path)
