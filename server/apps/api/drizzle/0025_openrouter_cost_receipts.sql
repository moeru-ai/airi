CREATE TABLE "llm_cost_receipt" (
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"generation_id" text,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"pending_reason" text,
	"pricing" jsonb NOT NULL,
	"usage" jsonb,
	"cost_usd" text,
	"micro_flux" bigint,
	"charged" bigint,
	"requested" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_cost_receipt_user_id_request_id_pk" PRIMARY KEY("user_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "llm_cost_remainder" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_cost_receipt_pending_idx" ON "llm_cost_receipt" USING btree ("status","created_at");