-- schema.sql | ShopSmart "dummy" table with dummy data

CREATE DATABASE IF NOT EXISTS smartshop;
USE smartshop;

-- One row per ShopSmart account. zip_code and search_radius_miles are what the
-- price comparison needs to know which stores to look at for this user.
CREATE TABLE IF NOT EXISTS dummy (
  user_id             INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name          VARCHAR(50)   NOT NULL,
  last_name           VARCHAR(50)   NOT NULL,
  email               VARCHAR(255)  NOT NULL UNIQUE,      -- UNIQUE: no two accounts share an email
  password_hash       VARCHAR(255)  NOT NULL,             -- never store real passwords, only hashes
  zip_code            CHAR(5)       NOT NULL,
  search_radius_miles TINYINT UNSIGNED NOT NULL DEFAULT 10,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dummy data (fake people, example.com emails, placeholder hashes).
-- INSERT IGNORE skips any row whose email already exists, so re-running adds no duplicates.
INSERT IGNORE INTO dummy (first_name, last_name, email, password_hash, zip_code, search_radius_miles) VALUES
  ('Ava',    'Johnson',  'ava.johnson@example.com',  'dummy_hash_not_a_real_password_1', '30303', 10),
  ('Marcus', 'Williams', 'marcus.w@example.com',     'dummy_hash_not_a_real_password_2', '30318', 15),
  ('Priya',  'Patel',    'priya.patel@example.com',  'dummy_hash_not_a_real_password_3', '30046',  5),
  ('Daniel', 'Okafor',   'daniel.o@example.com',     'dummy_hash_not_a_real_password_4', '30030', 20),
  ('Sofia',  'Martinez', 'sofia.m@example.com',      'dummy_hash_not_a_real_password_5', '30144', 10);

-- Run this last for your screenshot of the table and its data:
SELECT user_id, first_name, last_name, email, zip_code, search_radius_miles, created_at
FROM dummy;