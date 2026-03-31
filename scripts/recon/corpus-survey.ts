/**
 * Corpus Survey: Scans every PDF in the data directory for basic metadata.
 * Outputs: docs/recon/corpus-survey.json
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const DATA_DIR = path.resolve(__dirname, "../../data");
const OUTPUT = path.resolve(__dirname, "../../docs/recon/corpus-survey.json");

interface SurveyResult {
  filename: string;
  relativePath: string;
  category: string;
  fileSizeBytes: number;
  pages: number | null;
  hasExtractableText: boolean;
  firstPageTextLength: number;
  firstPageSample: string;
  error: string | null;
}

async function surveyPdf(filePath: string, category: string): Promise<SurveyResult> {
  const filename = path.basename(filePath);
  const relativePath = path.relative(DATA_DIR, filePath);
  const stats = fs.statSync(filePath);

  try {
    const parser = new PDFParse({ url: filePath });
    const result = await parser.getText();
    const firstPageText = result.pages?.[0]?.text?.trim() || "";
    const sample = firstPageText.slice(0, 500);

    return {
      filename,
      relativePath,
      category,
      fileSizeBytes: stats.size,
      pages: result.total ?? null,
      hasExtractableText: firstPageText.length > 50,
      firstPageTextLength: firstPageText.length,
      firstPageSample: sample,
      error: null,
    };
  } catch (err: any) {
    return {
      filename,
      relativePath,
      category,
      fileSizeBytes: stats.size,
      pages: null,
      hasExtractableText: false,
      firstPageTextLength: 0,
      firstPageSample: "",
      error: err.message,
    };
  }
}

function findPdfs(dir: string): { path: string; category: string }[] {
  const results: { path: string; category: string }[] = [];

  const policiesDir = path.join(dir, "Public Policies");
  if (fs.existsSync(policiesDir)) {
    for (const cat of fs.readdirSync(policiesDir)) {
      const catDir = path.join(policiesDir, cat);
      if (!fs.statSync(catDir).isDirectory()) continue;
      for (const file of fs.readdirSync(catDir)) {
        if (file.toLowerCase().endsWith(".pdf")) {
          results.push({ path: path.join(catDir, file), category: cat });
        }
      }
    }
  }

  for (const file of fs.readdirSync(dir)) {
    if (file.toLowerCase().endsWith(".pdf")) {
      results.push({ path: path.join(dir, file), category: "input" });
    }
  }

  return results;
}

async function main() {
  const pdfs = findPdfs(DATA_DIR);
  console.log(`Found ${pdfs.length} PDFs to survey`);

  const results: SurveyResult[] = [];
  let processed = 0;

  for (const pdf of pdfs) {
    const result = await surveyPdf(pdf.path, pdf.category);
    results.push(result);
    processed++;
    if (processed % 25 === 0 || processed === pdfs.length) {
      console.log(`  Surveyed ${processed}/${pdfs.length}`);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nSurvey complete. Output: ${OUTPUT}`);

  // Print summary stats
  const byCategory: Record<string, number> = {};
  let totalPages = 0;
  let extractable = 0;
  let errors = 0;
  let totalSize = 0;

  for (const r of results) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.pages) totalPages += r.pages;
    if (r.hasExtractableText) extractable++;
    if (r.error) errors++;
    totalSize += r.fileSizeBytes;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total PDFs: ${results.length}`);
  console.log(`Total pages: ${totalPages}`);
  console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Extractable text: ${extractable}/${results.length}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nBy category:`);
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  // Page count distribution
  const pageCounts = results.filter((r) => r.pages).map((r) => r.pages!);
  pageCounts.sort((a, b) => a - b);
  if (pageCounts.length > 0) {
    console.log(`\nPage count distribution:`);
    console.log(`  Min: ${pageCounts[0]}`);
    console.log(`  Max: ${pageCounts[pageCounts.length - 1]}`);
    console.log(`  Median: ${pageCounts[Math.floor(pageCounts.length / 2)]}`);
    console.log(`  Mean: ${(pageCounts.reduce((a, b) => a + b, 0) / pageCounts.length).toFixed(1)}`);
    const under10 = pageCounts.filter((p) => p <= 10).length;
    const under50 = pageCounts.filter((p) => p <= 50).length;
    const over50 = pageCounts.filter((p) => p > 50).length;
    console.log(`  <=10 pages: ${under10}, <=50 pages: ${under50}, >50 pages: ${over50}`);
  }
}

main().catch(console.error);
