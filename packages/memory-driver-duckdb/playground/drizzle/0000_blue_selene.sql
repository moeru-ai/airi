CREATE TABLE "users" (
	"id" bigint PRIMARY KEY DEFAULT 0 NOT NULL,
	CONSTRAINT "users_id_unique" UNIQUE("id")
);
