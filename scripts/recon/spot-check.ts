/**
 * Spot Check: Stratified sample of 2-3 PDFs per category, classified by an LLM.
 * Uses OpenAI gpt-4o-mini (cheap model) for classification.
 * Outputs: docs/recon/spot-check.json
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const DATA_DIR = path.resolve(__dirname, "../../data");
const OUTPUT = path.resolve(__dirname, "../../docs/recon/spot-check.json");
const POLICIES_DIR = path.join(DATA_DIR, "Public Policies");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

interface SpotCheckResult {
  filename: string;
  category: string;
  pages: number;
  firstChunkTokens: number;
  classification: {
    documentType: string;
    structure: string;
    complexity: string;
    estimatedRequirementDensity: string;
    extractionConcerns: string;
  } | null;
  error: string | null;
}

async function classifyWithOpenAI(text: string): Promise<any> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Analyze this policy document excerpt and classify it:
1. Document type: (policy, procedure, guideline, form, reference, other)
2. Structure: (numbered sections, narrative prose, tables, mixed)
3. Complexity: (simple/single-topic, moderate/multi-section, complex/comprehensive)
4. Estimated requirement density: (none, low, medium, high)
   - i.e., how many "must", "shall", "required to" statements per page?
5. Any extraction concerns: (clean text, has tables, has forms, multi-column, garbled, other)

Respond as JSON with keys: documentType, structure, complexity, estimatedRequirementDensity, extractionConcerns

Document excerpt:
${text}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

function selectSample(category: string, count: number): string[] {
  const catDir = path.join(POLICIES_DIR, category);
  if (!fs.existsSync(catDir)) return [];

  const files = fs
    .readdirSync(catDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  if (files.length <= count) return files.map((f) => path.join(catDir, f));

  // Pick evenly spaced samples: first, middle, last-ish
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    indices.push(Math.floor((i * (files.length - 1)) / (count - 1)));
  }
  return [...new Set(indices)].map((i) => path.join(catDir, files[i]));
}

async function spotCheckPdf(filePath: string, category: string): Promise<SpotCheckResult> {
  const filename = path.basename(filePath);

  try {
    const parser = new PDFParse({ url: filePath });
    const result = await parser.getText();
    const fullText = result.text?.trim() || "";

    // Take first ~2000 tokens (rough estimate: 4 chars/token = 8000 chars)
    const excerpt = fullText.slice(0, 8000);
    const estimatedTokens = Math.ceil(excerpt.length / 4);

    console.log(`  Classifying ${filename} (~${estimatedTokens} tokens)...`);
    const classification = await classifyWithOpenAI(excerpt);

    return {
      filename,
      category,
      pages: result.total || 0,
      firstChunkTokens: estimatedTokens,
      classification,
      error: null,
    };
  } catch (err: any) {
    return {
      filename,
      category,
      pages: 0,
      firstChunkTokens: 0,
      classification: null,
      error: err.message,
    };
  }
}

async function main() {
  const categories = fs
    .readdirSync(POLICIES_DIR)
    .filter((d) => fs.statSync(path.join(POLICIES_DIR, d)).isDirectory())
    .sort();

  console.log(`Categories: ${categories.join(", ")}`);

  const results: SpotCheckResult[] = [];

  for (const cat of categories) {
    const samples = selectSample(cat, 3);
    console.log(`\n${cat}: sampling ${samples.length} files`);

    for (const filePath of samples) {
      const result = await spotCheckPdf(filePath, cat);
      results.push(result);
    }
  }

  // Also spot-check the example input docs
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (file.toLowerCase().endsWith(".pdf")) {
      console.log(`\nInput doc: ${file}`);
      const result = await spotCheckPdf(path.join(DATA_DIR, file), "input");
      results.push(result);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nSpot check complete. Output: ${OUTPUT}`);

  // Summary
  const types: Record<string, number> = {};
  const structures: Record<string, number> = {};
  const complexities: Record<string, number> = {};
  const concerns: Record<string, number> = {};

  for (const r of results) {
    if (r.classification) {
      const t = r.classification.documentType;
      types[t] = (types[t] || 0) + 1;
      const s = r.classification.structure;
      structures[s] = (structures[s] || 0) + 1;
      const c = r.classification.complexity;
      complexities[c] = (complexities[c] || 0) + 1;
      const e = r.classification.extractionConcerns;
      concerns[e] = (concerns[e] || 0) + 1;
    }
  }

  console.log(`\n=== Classification Summary ===`);
  console.log(`Document types:`, types);
  console.log(`Structures:`, structures);
  console.log(`Complexities:`, complexities);
  console.log(`Extraction concerns:`, concerns);
}

main().catch(console.error);
