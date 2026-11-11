// usertable.js | Connects to the smartshop MySQL database from Node and prints the users table.
// Run with:  node usertable.js

// dotenv reads DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME from a local .env file,
// so the database password is never written into this source file (or committed to GitHub).
require("dotenv").config();

const mysql = require("mysql2"); // MySQL driver for Node

// Build the connection from the .env values (falls back to common local defaults)
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Open the connection and report whether it worked
conn.connect(function (err) {
  if (err) {
    console.log("Couldn't connect to MySQL:", err.message);
    process.exit(1); // stop here: nothing else can run without a connection
  }
  console.log("Database connection established");
  console.log(`Connected to "${conn.config.database}" at ${conn.config.host}:${conn.config.port}`);

  // Read every row in the users table (password_hash is left out of the output on purpose)
  const sql =
    "SELECT user_id, first_name, last_name, email, zip_code, search_radius_miles FROM dummy";
  conn.query(sql, function (queryErr, rows) {
    if (queryErr) {
      console.log("Query failed:", queryErr.message);
    } else {
      console.log(`\nusers table (${rows.length} rows):`);
      console.table(rows); // prints the rows as a neat table in the terminal
    }
    conn.end(); // close the connection so the script can exit
  });
});