CREATE TABLE "community_survey_invite_email" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"to_email" text,
	"survey_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_survey_invite_email_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "community_survey_invite_email_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
