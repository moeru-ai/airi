UPDATE "user"
SET "email_verified" = false
WHERE lower("email") LIKE '%.placeholder.local'
  AND "email_verified" = true;
