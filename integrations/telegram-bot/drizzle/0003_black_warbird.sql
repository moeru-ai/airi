CREATE TABLE "chat_completions_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_episodic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location" text DEFAULT '',
	"created_at" bigint DEFAULT 0 NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_fragments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"memory_type" text NOT NULL,
	"category" text NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"emotional_impact" integer DEFAULT 0 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"last_accessed" bigint DEFAULT 0 NOT NULL,
	"access_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768),
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_long_term_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"deadline" bigint DEFAULT null,
	"status" text DEFAULT 'planned' NOT NULL,
	"parent_goal_id" uuid,
	"category" text DEFAULT 'personal' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_short_term_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"source_type" text DEFAULT 'dream' NOT NULL,
	"source_id" text DEFAULT null,
	"status" text DEFAULT 'new' NOT NULL,
	"excitement" integer DEFAULT 5 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768),
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
ALTER TABLE "memory_episodic" ADD CONSTRAINT "memory_episodic_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_long_term_goals" ADD CONSTRAINT "memory_long_term_goals_parent_goal_id_memory_long_term_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."memory_long_term_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_tags" ADD CONSTRAINT "memory_tags_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_episodic_memory_id_index" ON "memory_episodic" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_episodic_event_type_index" ON "memory_episodic" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_1536_index" ON "memory_fragments" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_1024_index" ON "memory_fragments" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_768_index" ON "memory_fragments" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_memory_type_index" ON "memory_fragments" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "memory_items_category_index" ON "memory_fragments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "memory_items_importance_index" ON "memory_fragments" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "memory_items_created_at_index" ON "memory_fragments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_items_last_accessed_index" ON "memory_fragments" USING btree ("last_accessed");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_priority_index" ON "memory_long_term_goals" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_status_index" ON "memory_long_term_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_deadline_index" ON "memory_long_term_goals" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_parent_goal_id_index" ON "memory_long_term_goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_source_type_index" ON "memory_short_term_ideas" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_status_index" ON "memory_short_term_ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_excitement_index" ON "memory_short_term_ideas" USING btree ("excitement");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_1536_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_1024_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_768_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_tags_memory_id_index" ON "memory_tags" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_tags_tag_index" ON "memory_tags" USING btree ("tag");