CREATE TABLE `app_section_daily_views` (
	`local_date` text NOT NULL,
	`section` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`local_date`, `section`)
);
