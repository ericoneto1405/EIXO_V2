-- Rename raw reset token column to hashed token column
ALTER TABLE "PasswordResetToken" RENAME COLUMN "token" TO "tokenHash";

-- Keep Prisma naming convention for unique index
ALTER INDEX "PasswordResetToken_token_key" RENAME TO "PasswordResetToken_tokenHash_key";
