// db.js - MySQL connection pool and the small "user repository" the server talks to.
// Keeping every query in one place makes the server easy to test and easy to read.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const COLUMNS = 'user_id, username, email, password_hash, auth0_id';

const users = {
  // Log in with either username or email.
  async findByLogin(login) {
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [login, login.toLowerCase()]
    );
    return rows[0] || null;
  },
  async findByEmail(email) {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM users WHERE email = ? LIMIT 1`, [email]);
    return rows[0] || null;
  },
  async findByUsername(username) {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM users WHERE username = ? LIMIT 1`, [username]);
    return rows[0] || null;
  },
  async findByAuth0Id(auth0Id) {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM users WHERE auth0_id = ? LIMIT 1`, [auth0Id]);
    return rows[0] || null;
  },
  async create({ username, email, passwordHash = null, auth0Id = null }) {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, auth0_id) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, auth0Id]
    );
    return { user_id: result.insertId, username, email, password_hash: passwordHash, auth0_id: auth0Id };
  },
  async linkAuth0(userId, auth0Id) {
    await pool.query('UPDATE users SET auth0_id = ? WHERE user_id = ?', [auth0Id, userId]);
  },
  async ping() {
    await pool.query('SELECT 1');
  },
};

module.exports = { pool, users };