CREATE INDEX "oauth_refresh_token_token_idx" ON "oauth_refresh_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_members_user_id_member_type_chat_id_idx" ON "chat_members" USING btree ("user_id","member_type","chat_id");--> statement-breakpoint
CREATE INDEX "chat_members_chat_id_member_type_user_id_idx" ON "chat_members" USING btree ("chat_id","member_type","user_id");--> statement-breakpoint
CREATE INDEX "messages_chat_id_seq_active_idx" ON "messages" USING btree ("chat_id","seq") WHERE "messages"."deleted_at" IS NULL;