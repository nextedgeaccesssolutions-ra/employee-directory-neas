ALTER TABLE `users` MODIFY COLUMN `role` enum('user','editor','reviewer','publisher','admin','hr','manager') NOT NULL DEFAULT 'user';
--> statement-breakpoint
CREATE TABLE `employees` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(180) NOT NULL,
  `role` varchar(160) NOT NULL,
  `email` varchar(320) NOT NULL,
  `driveFolderId` varchar(255) NOT NULL,
  `createdBy` int NOT NULL,
  `updatedBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `employees_email_idx` ON `employees` (`email`);
