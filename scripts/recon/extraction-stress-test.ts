/**
 * Extraction Stress Test: Tests full text extraction on the 5 largest and 5 smallest PDFs.
 * Checks for: text quality, extraction time, estimated token counts, common problems.
 * Outputs: docs/recon/stress-test.json
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const DATA_DIR = path.resolve(__dirname, "../../data");
const OUTPUT = path.resolve(__dirname, "../../docs/recon/stress-test.json");

interface StressTestResult {
  filename: string;
  category: string;
  fileSizeBytes: number;
  pages: number;
  totalCharCount: number;
  estimatedTokens: number;
  extractionTimeMs: number;
  charsPerPage: number;
  emptyPages: number[];
  extremelyLongPages: number[];
  hasGarbledText: boolean;
  garbledSample: string;
  repeatedPatterns: string[];
  textSample: { first500: string; last500: string };
  error: string | null;
}

function findAllPdfs(): { path: string; category: string; size: number }[] {
  const results: { path: string; category: string; size: number }[] = [];

  const policiesDir = path.join(DATA_DIR, "Public Policies");
  if (fs.existsSync(policiesDir)) {
    for (const cat of fs.readdirSync(policiesDir)) {
      const catDir = path.join(policiesDir, cat);
      if (!fs.statSync(catDir).isDirectory()) continue;
      for (const file of fs.readdirSync(catDir)) {
        if (file.toLowerCase().endsWith(".pdf")) {
          const filePath = path.join(catDir, file);
          results.push({ path: filePath, category: cat, size: fs.statSync(filePath).size });
        }
      }
    }
  }

  for (const file of fs.readdirSync(DATA_DIR)) {
    if (file.toLowerCase().endsWith(".pdf")) {
      const filePath = path.join(DATA_DIR, file);
      results.push({ path: filePath, category: "input", size: fs.statSync(filePath).size });
    }
  }

  return results;
}

function detectGarbled(text: string): { garbled: boolean; sample: string } {
  const nonAsciiChars = text.replace(/[\x20-\x7E\n\r\t]/g, "");
  const ratio = nonAsciiChars.length / Math.max(text.length, 1);
  const garbledPattern = /[^\w\s.,;:!?'"()\-/]{5,}/;
  const match = text.match(garbledPattern);

  return {
    garbled: ratio > 0.1 || !!match,
    sample: match ? match[0].slice(0, 100) : nonAsciiChars.slice(0, 100),
  };
}

function findRepeatedPatterns(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 10 && l.length < 200);
  const freq: Record<string, number> = {};
  for (const line of lines) {
    freq[line] = (freq[line] || 0) + 1;
  }

  return Object.entries(freq)
    .filter(([, count]) => count >= 5)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([line, count]) => `${count}x: "${line.slice(0, 80)}"`);
}

async function stressTestPdf(filePath: string, category: string): Promise<StressTestResult> {
  const filename = path.basename(filePath);
  const stats = fs.statSync(filePath);

  try {
    const start = Date.now();
    const parser = new PDFParse({ url: filePath });
    const result = await parser.getText();
    const extractionTimeMs = Date.now() - start;

    const fullText = result.text || "";
    const totalCharCount = fullText.length;
    const estimatedTokens = Math.ceil(totalCharCount / 4);
    const pages = result.total || 0;
    const charsPerPage = pages > 0 ? Math.round(totalCharCount / pages) : 0;

    // Check per-page text from the pages array
    const emptyPages: number[] = [];
    const extremelyLongPages: number[] = [];
    if (Array.isArray(result.pages)) {
      for (let i = 0; i < result.pages.length; i++) {
        const pageText = result.pages[i]?.text || "";
        if (pageText.trim().length < 10) emptyPages.push(i + 1);
        if (pageText.length > 10000) extremelyLongPages.push(i + 1);
      }
    }

    const garbled = detectGarbled(fullText);
    const repeatedPatterns = findRepeatedPatterns(fullText);

    return {
      filename,
      category,
      fileSizeBytes: stats.size,
      pages,
      totalCharCount,
      estimatedTokens,
      extractionTimeMs,
      charsPerPage,
      emptyPages,
      extremelyLongPages,
      hasGarbledText: garbled.garbled,
      garbledSample: garbled.sample,
      repeatedPatterns,
      textSample: {
        first500: fullText.slice(0, 500),
        last500: fullText.slice(-500),
      },
      error: null,
    };
  } catch (err: any) {
    return {
      filename,
      category,
      fileSizeBytes: stats.size,
      pages: 0,
      totalCharCount: 0,
      estimatedTokens: 0,
      extractionTimeMs: 0,
      charsPerPage: 0,
      emptyPages: [],
      extremelyLongPages: [],
      hasGarbledText: false,
      garbledSample: "",
      repeatedPatterns: [],
      textSample: { first500: "", last500: "" },
      error: err.message,
    };
  }
}

async function main() {
  const allPdfs = findAllPdfs();
  allPdfs.sort((a, b) => a.size - b.size);

  const smallest5 = allPdfs.slice(0, 5);
  const largest5 = allPdfs.slice(-5).reverse();
  const selected = [...largest5, ...smallest5];

  console.log("=== Extraction Stress Test ===");
  console.log(`\nLargest 5:`);
  for (const f of largest5) {
    console.log(`  ${path.basename(f.path)} (${(f.size / 1024 / 1024).toFixed(2)} MB)`);
  }
  console.log(`\nSmallest 5:`);
  for (const f of smallest5) {
    console.log(`  ${path.basename(f.path)} (${(f.size / 1024).toFixed(1)} KB)`);
  }

  const results: StressTestResult[] = [];

  for (const pdf of selected) {
    console.log(`\nProcessing ${path.basename(pdf.path)}...`);
    const result = await stressTestPdf(pdf.path, pdf.category);
    results.push(result);
    console.log(
      `  Pages: ${result.pages}, Chars: ${result.totalCharCount.toLocaleString()}, Tokens: ~${result.estimatedTokens.toLocaleString()}, Time: ${result.extractionTimeMs}ms`
    );
    if (result.emptyPages.length > 0) {
      console.log(`  Empty pages: ${result.emptyPages.join(", ")}`);
    }
    if (result.hasGarbledText) {
      console.log(`  WARNING: Garbled text detected`);
    }
    if (result.repeatedPatterns.length > 0) {
      console.log(`  Repeated patterns: ${result.repeatedPatterns.length}`);
    }
    if (result.error) {
      console.log(`  ERROR: ${result.error}`);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nStress test complete. Output: ${OUTPUT}`);

  // Extrapolate total corpus stats
  const allSizes = allPdfs.map((p) => p.size);
  const totalCorpusSize = allSizes.reduce((a, b) => a + b, 0);

  const validResults = results.filter((r) => !r.error && r.totalCharCount > 0);
  const avgCharsPerByte =
    validResults.reduce((sum, r) => sum + r.totalCharCount / r.fileSizeBytes, 0) / validResults.length;
  const estimatedTotalChars = Math.round(totalCorpusSize * avgCharsPerByte);
  const estimatedTotalTokens = Math.ceil(estimatedTotalChars / 4);

  console.log(`\n=== Corpus Token Estimate ===`);
  console.log(`Total corpus size: ${(totalCorpusSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Avg chars/byte (from sample): ${avgCharsPerByte.toFixed(2)}`);
  console.log(`Estimated total chars: ${estimatedTotalChars.toLocaleString()}`);
  console.log(`Estimated total tokens: ${estimatedTotalTokens.toLocaleString()}`);
  console.log(`Estimated embedding cost (text-embedding-3-small @ $0.02/1M tokens): $${(estimatedTotalTokens * 0.02 / 1_000_000).toFixed(4)}`);
}

main().catch(console.error);
