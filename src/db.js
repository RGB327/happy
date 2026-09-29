const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "happy",
  waitForConnections: true,
  connectionLimit: 10,
  // MySQL 세션은 UTC로 시간을 반환하는데, mysql2는 기본적으로 이 문자열을
  // Node 프로세스의 로컬 시간대로 잘못 해석한다. UTC로 명시해서 방지한다.
  timezone: "Z",
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS moods (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      mood VARCHAR(20) NOT NULL,
      message VARCHAR(200),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_moods_user_created (user_id, created_at)
    ) ENGINE=InnoDB
  `);
}

module.exports = { pool, initDb };
