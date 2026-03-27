CREATE TABLE "user_flux" (
	"user_id" text PRIMARY KEY NOT NULL,
	"flux" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;