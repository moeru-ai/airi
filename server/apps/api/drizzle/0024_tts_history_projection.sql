CREATE TABLE "flux_history_row" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"conversation_id" text,
	"round_id" text,
	"description" text NOT NULL,
	"charge_count" integer NOT NULL,
	"total_amount" bigint NOT NULL,
	"first_time" timestamp NOT NULL,
	"last_time" timestamp NOT NULL,
	"latest_entry_id" text NOT NULL,
	CONSTRAINT "flux_history_row_user_id_key_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "flux_history_row_kind_check" CHECK ("flux_history_row"."kind" IN ('single', 'tts_round')),
	CONSTRAINT "flux_history_row_correlation_check" CHECK ((
    "flux_history_row"."kind" = 'single'
    AND "flux_history_row"."conversation_id" IS NULL
    AND "flux_history_row"."round_id" IS NULL
  ) OR (
    "flux_history_row"."kind" = 'tts_round'
    AND "flux_history_row"."conversation_id" IS NOT NULL
    AND "flux_history_row"."round_id" IS NOT NULL
    AND char_length("flux_history_row"."conversation_id") BETWEEN 1 AND 128
    AND char_length("flux_history_row"."round_id") BETWEEN 1 AND 128
  ))
);
--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "history_group_key" text;--> statement-breakpoint
CREATE INDEX "flux_history_row_user_last_idx" ON "flux_history_row" USING btree ("user_id","last_time" DESC NULLS LAST,"key" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "flux_tx_user_history_group_idx" ON "flux_transaction" USING btree ("user_id","history_group_key","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "flux_history_row" (
	"user_id",
	"key",
	"kind",
	"description",
	"charge_count",
	"total_amount",
	"first_time",
	"last_time",
	"latest_entry_id"
)
SELECT
	"user_id",
	'transaction:' || "id",
	'single',
	"description",
	1,
	"amount",
	"created_at",
	"created_at",
	"id"
FROM "flux_transaction";--> statement-breakpoint
CREATE FUNCTION "sync_flux_history_row_after_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."history_group_key" IS NOT NULL
		AND NEW."type" = 'debit'
		AND NEW."description" = 'tts_request'
	THEN
		INSERT INTO "flux_history_row" (
			"user_id",
			"key",
			"kind",
			"conversation_id",
			"round_id",
			"description",
			"charge_count",
			"total_amount",
			"first_time",
			"last_time",
			"latest_entry_id"
		)
		VALUES (
			NEW."user_id",
			NEW."history_group_key",
			'tts_round',
			NEW."metadata"->>'conversationId',
			NEW."metadata"->>'roundId',
			NEW."description",
			1,
			NEW."amount",
			NEW."created_at",
			NEW."created_at",
			NEW."id"
		)
		ON CONFLICT ("user_id", "key") DO UPDATE SET
			"charge_count" = "flux_history_row"."charge_count" + 1,
			"total_amount" = "flux_history_row"."total_amount" + EXCLUDED."total_amount",
			"first_time" = LEAST("flux_history_row"."first_time", EXCLUDED."first_time"),
			"last_time" = GREATEST("flux_history_row"."last_time", EXCLUDED."last_time"),
			"latest_entry_id" = CASE
				WHEN (EXCLUDED."last_time", EXCLUDED."latest_entry_id")
					> ("flux_history_row"."last_time", "flux_history_row"."latest_entry_id")
				THEN EXCLUDED."latest_entry_id"
				ELSE "flux_history_row"."latest_entry_id"
			END;
	ELSE
		INSERT INTO "flux_history_row" (
			"user_id",
			"key",
			"kind",
			"description",
			"charge_count",
			"total_amount",
			"first_time",
			"last_time",
			"latest_entry_id"
		)
		VALUES (
			NEW."user_id",
			'transaction:' || NEW."id",
			'single',
			NEW."description",
			1,
			NEW."amount",
			NEW."created_at",
			NEW."created_at",
			NEW."id"
		);
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "flux_transaction_history_projection_insert"
AFTER INSERT ON "flux_transaction"
FOR EACH ROW
EXECUTE FUNCTION "sync_flux_history_row_after_insert"();
