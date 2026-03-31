import { sqliteTable, text, integer, real, blob, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const regulatoryDocuments = sqliteTable("regulatory_documents", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  title: text("title"),
  description: text("description"),
  pageCount: integer("page_count"),
  status: text("status").notNull().default("pending"),
  statusMessage: text("status_message"),
  rawText: text("raw_text"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const requirements = sqliteTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    regulatoryDocumentId: text("regulatory_document_id")
      .notNull()
      .references(() => regulatoryDocuments.id),
    requirementNumber: text("requirement_number"),
    text: text("text").notNull(),
    reference: text("reference"),
    category: text("category"),
    complianceStatus: text("compliance_status").default("unclear"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_requirements_regulatory_document_id").on(
      table.regulatoryDocumentId
    ),
    index("idx_requirements_compliance_status").on(table.complianceStatus),
  ]
);

export const policyDocuments = sqliteTable(
  "policy_documents",
  {
    id: text("id").primaryKey(),
    filename: text("filename").notNull(),
    category: text("category").notNull(),
    title: text("title"),
    pageCount: integer("page_count"),
    status: text("status").notNull().default("pending"),
    statusMessage: text("status_message"),
    rawText: text("raw_text"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_policy_documents_category").on(table.category)]
);

export const policyChunks = sqliteTable(
  "policy_chunks",
  {
    id: text("id").primaryKey(),
    policyDocumentId: text("policy_document_id")
      .notNull()
      .references(() => policyDocuments.id),
    pageNumber: integer("page_number"),
    chunkIndex: integer("chunk_index"),
    text: text("text").notNull(),
    embedding: blob("embedding", { mode: "buffer" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_policy_chunks_policy_document_id").on(table.policyDocumentId),
  ]
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    requirementId: text("requirement_id")
      .notNull()
      .references(() => requirements.id),
    policyChunkId: text("policy_chunk_id")
      .notNull()
      .references(() => policyChunks.id),
    status: text("status").notNull(),
    excerpt: text("excerpt"),
    reasoning: text("reasoning"),
    confidence: real("confidence"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_evidence_requirement_id").on(table.requirementId),
    index("idx_evidence_policy_chunk_id").on(table.policyChunkId),
  ]
);

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
