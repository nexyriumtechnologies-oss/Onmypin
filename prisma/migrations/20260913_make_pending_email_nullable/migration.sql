-- Registration email became optional (the app may not collect it).
ALTER TABLE `pending_registrations` MODIFY `email` VARCHAR(191) NULL;
