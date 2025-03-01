CREATE TABLE "edge_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" uuid,
	"target" uuid,
	CONSTRAINT "edge_groups_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "edge_owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" uuid,
	"target" uuid,
	CONSTRAINT "edge_owners_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "edge_pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" uuid,
	"target" uuid,
	CONSTRAINT "edge_pets_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "edge_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" uuid,
	"target" uuid,
	CONSTRAINT "edge_users_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "node_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "node_groups_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "node_pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "node_pets_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "node_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	CONSTRAINT "node_users_id_unique" UNIQUE("id")
);
