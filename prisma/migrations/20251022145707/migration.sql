-- AlterTable
ALTER TABLE `jwks` MODIFY `publicKey` TEXT NOT NULL,
    MODIFY `privateKey` TEXT NOT NULL;
