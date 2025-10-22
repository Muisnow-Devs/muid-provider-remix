-- AlterTable
ALTER TABLE `account` MODIFY `accessToken` TEXT NULL,
    MODIFY `refreshToken` TEXT NULL,
    MODIFY `idToken` TEXT NULL,
    MODIFY `scope` TEXT NULL;

-- AlterTable
ALTER TABLE `oauthaccesstoken` MODIFY `scopes` TEXT NULL;

-- AlterTable
ALTER TABLE `oauthconsent` MODIFY `scopes` TEXT NULL;
