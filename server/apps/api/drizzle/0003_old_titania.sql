CREATE TABLE "llm_request_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"flux_consumed" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD CONSTRAINT "llm_request_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;