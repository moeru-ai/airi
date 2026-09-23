CREATE INDEX IF NOT EXISTS "messages_chat_id_seq_idx" ON "messages" USING btree ("chat_id","seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_account_id_provider_id_idx" ON "account" USING btree ("account_id","provider_id");
