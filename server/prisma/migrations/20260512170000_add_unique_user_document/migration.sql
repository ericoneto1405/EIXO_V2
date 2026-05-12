-- Enforce one account per CPF/CNPJ document
ALTER TABLE "User"
ADD CONSTRAINT "User_document_key" UNIQUE ("document");
