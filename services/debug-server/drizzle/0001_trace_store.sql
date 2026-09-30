CREATE TABLE "events" (
	"cursor" bigint PRIMARY KEY DEFAULT nextval('debug_event_cursor') NOT NULL,
	"batch_cursor" bigint NOT NULL,
	"kind" varchar NOT NULL,
	"trace_id" varchar NOT NULL,
	"span_id" varchar NOT NULL,
	"parent_span_id" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"source_id" varchar NOT NULL,
	"service_name" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"time_unix_nano" "HUGEINT" NOT NULL,
	"received_unix_nano" "HUGEINT" NOT NULL,
	"span_end_time_unix_nano" "HUGEINT" NOT NULL,
	"span_status_code" integer NOT NULL,
	"severity_number" integer NOT NULL,
	"severity_text" varchar NOT NULL,
	"resource_json" varchar NOT NULL,
	"resource_schema_url" varchar NOT NULL,
	"scope_json" varchar NOT NULL,
	"scope_schema_url" varchar NOT NULL,
	"raw_json" varchar NOT NULL,
	"payload_hash" varchar NOT NULL,
	"unique_key" varchar,
	CONSTRAINT "events_unique_key" UNIQUE("unique_key")
);
--> statement-breakpoint
CREATE TABLE "ingest_batches" (
	"cursor" bigint PRIMARY KEY DEFAULT nextval('debug_batch_cursor') NOT NULL,
	"signal" varchar NOT NULL,
	"content_type" varchar NOT NULL,
	"content_encoding" varchar NOT NULL,
	"body" "BLOB" NOT NULL,
	"received_unix_nano" "HUGEINT" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"key" varchar PRIMARY KEY NOT NULL,
	"value" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"cursor" bigint PRIMARY KEY DEFAULT nextval('debug_source_cursor') NOT NULL,
	"source_id" varchar NOT NULL,
	"service_name" varchar NOT NULL,
	"first_seen_unix_nano" "HUGEINT" NOT NULL,
	"last_seen_unix_nano" "HUGEINT" NOT NULL,
	"event_count" bigint NOT NULL,
	"saw_spans" boolean NOT NULL,
	"saw_logs" boolean NOT NULL,
	CONSTRAINT "sources_source_service" UNIQUE("source_id","service_name")
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"cursor" bigint PRIMARY KEY DEFAULT nextval('debug_trace_cursor') NOT NULL,
	"trace_id" varchar NOT NULL,
	"source_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"first_seen_unix_nano" "HUGEINT" NOT NULL,
	"last_seen_unix_nano" "HUGEINT" NOT NULL,
	"state" integer NOT NULL,
	"span_count" bigint NOT NULL,
	"log_count" bigint NOT NULL,
	"last_event_cursor" bigint NOT NULL,
	CONSTRAINT "traces_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE INDEX "events_trace_cursor" ON "events" USING art ("trace_id","cursor");--> statement-breakpoint
CREATE INDEX "events_span_cursor" ON "events" USING art ("span_id","cursor");--> statement-breakpoint
CREATE INDEX "events_source_cursor" ON "events" USING art ("source_id","cursor");