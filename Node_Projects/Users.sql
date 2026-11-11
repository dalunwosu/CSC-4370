CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)   NOT NULL UNIQUE,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NULL,          -- NULL for people who only use Google/Apple
  auth0_id      VARCHAR(100)  NULL UNIQUE,   -- Auth0 "sub", set for Google/Apple sign-ins
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);