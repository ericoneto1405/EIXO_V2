-- Enforce one account per phone number
ALTER TABLE "User"
ADD CONSTRAINT "User_phone_key" UNIQUE ("phone");
