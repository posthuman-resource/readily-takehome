import { resolve } from "node:path";
import { PDFParse } from "pdf-parse";

export interface PageText {
  pageNumber: number; // 1-indexed
  text: string;
}

export interface ExtractedDocument {
  text: string; // Full concatenated text
  pages: PageText[]; // Per-page text
  pageCount: number;
}

/**
 * Normalize whitespace: collapse runs of 3+ newlines into 2, normalize smart quotes.
 */
function cleanText(raw: string): string {
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--");
}

export async function extractPdfText(filePath: string): Promise<ExtractedDocument> {
  const absolutePath = resolve(filePath);

  const parser = new PDFParse({ url: absolutePath });
  try {
    const result = await parser.getText();

    if (result.total > 0 && !result.text.trim()) {
      console.warn(`Warning: PDF has ${result.total} pages but extracted text is empty: ${filePath}`);
    }

    const pages: PageText[] = result.pages.map((p) => ({
      pageNumber: p.num,
      text: cleanText(p.text),
    }));

    return {
      text: cleanText(result.text),
      pages,
      pageCount: result.total,
    };
  } finally {
    await parser.destroy();
  }
}
