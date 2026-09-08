-- CreateTable
CREATE TABLE `dse_categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `dse_categories_slug_key`(`slug`),
    INDEX `dse_categories_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dse_contents` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `shortDescription` VARCHAR(500) NULL,
    `description` TEXT NOT NULL,
    `contentType` ENUM('NEWS', 'GOVERNMENT_UPDATE', 'PUBLIC_INFORMATION', 'ANNOUNCEMENT', 'AWARENESS', 'EDUCATIONAL_ARTICLE') NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `thumbnailUrl` VARCHAR(191) NULL,
    `coverImageUrl` VARCHAR(191) NULL,
    `externalUrl` VARCHAR(191) NULL,
    `authorName` VARCHAR(191) NULL,
    `sourceName` VARCHAR(191) NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `dse_contents_slug_key`(`slug`),
    INDEX `dse_contents_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `dse_contents_status_contentType_publishedAt_idx`(`status`, `contentType`, `publishedAt`),
    INDEX `dse_contents_status_categoryId_publishedAt_idx`(`status`, `categoryId`, `publishedAt`),
    INDEX `dse_contents_isFeatured_idx`(`isFeatured`),
    INDEX `dse_contents_isPinned_idx`(`isPinned`),
    INDEX `dse_contents_createdAt_idx`(`createdAt`),
    INDEX `dse_contents_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dse_media` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `mediaType` ENUM('IMAGE') NOT NULL DEFAULT 'IMAGE',
    `url` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dse_media_contentId_idx`(`contentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dse_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `contentId` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED', 'UPDATED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'UNARCHIVED', 'DELETED', 'FEATURED', 'UNFEATURED', 'PINNED', 'UNPINNED') NOT NULL,
    `oldStatus` VARCHAR(191) NULL,
    `newStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dse_audit_logs_contentId_idx`(`contentId`),
    INDEX `dse_audit_logs_adminId_idx`(`adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dse_contents` ADD CONSTRAINT `dse_contents_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `dse_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dse_media` ADD CONSTRAINT `dse_media_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `dse_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dse_audit_logs` ADD CONSTRAINT `dse_audit_logs_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `dse_contents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
