CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`policy_chunk_id` text NOT NULL,
	`status` text NOT NULL,
	`excerpt` text,
	`reasoning` text,
	`confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_chunk_id`) REFERENCES `policy_chunks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_requirement_id` ON `evidence` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `idx_evidence_policy_chunk_id` ON `evidence` (`policy_chunk_id`);--> statement-breakpoint
CREATE TABLE `policy_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_document_id` text NOT NULL,
	`page_number` integer,
	`chunk_index` integer,
	`text` text NOT NULL,
	`embedding` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`policy_document_id`) REFERENCES `policy_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_policy_chunks_policy_document_id` ON `policy_chunks` (`policy_document_id`);--> statement-breakpoint
CREATE TABLE `policy_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`category` text NOT NULL,
	`title` text,
	`page_count` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_message` text,
	`raw_text` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_policy_documents_category` ON `policy_documents` (`category`);--> statement-breakpoint
CREATE TABLE `regulatory_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`title` text,
	`description` text,
	`page_count` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_message` text,
	`raw_text` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`regulatory_document_id` text NOT NULL,
	`requirement_number` text,
	`text` text NOT NULL,
	`reference` text,
	`category` text,
	`compliance_status` text DEFAULT 'unclear',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`regulatory_document_id`) REFERENCES `regulatory_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_requirements_regulatory_document_id` ON `requirements` (`regulatory_document_id`);--> statement-breakpoint
CREATE INDEX `idx_requirements_compliance_status` ON `requirements` (`compliance_status`);