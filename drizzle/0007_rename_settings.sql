ALTER TABLE "platform_settings" RENAME TO "settings";
ALTER TABLE "settings" RENAME CONSTRAINT "platform_settings_key_unique" TO "settings_key_unique";
