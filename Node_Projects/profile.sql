-- ShopSmart profile data. Run once in MySQL Workbench against the same database as your users table.
-- (Run schema_users.sql first if you haven't.)

-- Personal details, location and photo live on the users table.
ALTER TABLE users
  ADD COLUMN first_name    VARCHAR(50)  NULL,
  ADD COLUMN last_name     VARCHAR(50)  NULL,
  ADD COLUMN date_of_birth DATE         NULL,
  ADD COLUMN zip_code      CHAR(5)      NULL,
  ADD COLUMN radius_miles  TINYINT UNSIGNED NOT NULL DEFAULT 10,
  ADD COLUMN avatar_file   VARCHAR(100) NULL;

-- One preferred brand per grocery item, per user (e.g. milk -> Kroger).
CREATE TABLE IF NOT EXISTS brand_preferences (
  pref_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  item    VARCHAR(60)  NOT NULL,
  brand   VARCHAR(60)  NOT NULL,
  UNIQUE KEY uq_user_item (user_id, item),
  CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);