DROP TABLE IF EXISTS chat_review_logs;
DELETE FROM site_settings WHERE k = 'send.daily_limit';
