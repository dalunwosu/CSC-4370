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
  dateStrings: true, // DATE columns come back as 'YYYY-MM-DD' text, not JavaScript Date objects
});

const COLUMNS =
  'user_id, username, email, password_hash, auth0_id, first_name, last_name, date_of_birth, zip_code, radius_miles, avatar_file';

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
  async findById(userId) {
    const [rows] = await pool.query(`SELECT ${COLUMNS} FROM users WHERE user_id = ? LIMIT 1`, [userId]);
    return rows[0] || null;
  },
  async create({ username, email, passwordHash = null, auth0Id = null, firstName = null, lastName = null }) {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, auth0_id, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, auth0Id, firstName, lastName]
    );
    return {
      user_id: result.insertId, username, email, password_hash: passwordHash, auth0_id: auth0Id,
      first_name: firstName, last_name: lastName, date_of_birth: null, zip_code: null, radius_miles: 10, avatar_file: null,
    };
  },
  async updateDetails(userId, { firstName, lastName, dateOfBirth }) {
    await pool.query('UPDATE users SET first_name = ?, last_name = ?, date_of_birth = ? WHERE user_id = ?',
      [firstName, lastName, dateOfBirth, userId]);
  },
  async updateLocation(userId, { zipCode, radiusMiles }) {
    await pool.query('UPDATE users SET zip_code = ?, radius_miles = ? WHERE user_id = ?', [zipCode, radiusMiles, userId]);
  },
  async setAvatar(userId, file) {
    await pool.query('UPDATE users SET avatar_file = ? WHERE user_id = ?', [file, userId]);
  },
  async listBrands(userId) {
    const [rows] = await pool.query(
      'SELECT pref_id, item, brand FROM brand_preferences WHERE user_id = ? ORDER BY item', [userId]);
    return rows;
  },
  // Adding an item that already exists just changes its brand.
  async saveBrand(userId, item, brand) {
    await pool.query(
      'INSERT INTO brand_preferences (user_id, item, brand) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE brand = VALUES(brand)',
      [userId, item, brand]);
  },
  async deleteBrand(userId, prefId) {
    await pool.query('DELETE FROM brand_preferences WHERE user_id = ? AND pref_id = ?', [userId, prefId]);
  },
  async linkAuth0(userId, auth0Id) {
    await pool.query('UPDATE users SET auth0_id = ? WHERE user_id = ?', [auth0Id, userId]);
  },
  async ping() {
    await pool.query('SELECT 1');
  },
};

module.exports = { pool, users };