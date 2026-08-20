-- AlterTable
ALTER TABLE `users` ADD COLUMN `passwordHash` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `pending_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pending_registrations_mobile_key`(`mobile`),
    UNIQUE INDEX `pending_registrations_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
