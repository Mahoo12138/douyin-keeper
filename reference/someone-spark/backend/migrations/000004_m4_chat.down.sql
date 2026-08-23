ALTER TABLE chat_messages DROP INDEX uk_chat_dedup, DROP INDEX uk_chat_platform;
DROP TABLE IF EXISTS daily_first_message_counters;
DROP TABLE IF EXISTS daily_send_counters;
DROP TABLE IF EXISTS send_uniques;
DROP TABLE IF EXISTS send_jobs;
DROP TABLE IF EXISTS media_objects;
DROP TABLE IF EXISTS stickers_cache;
DROP TABLE IF EXISTS friends;
