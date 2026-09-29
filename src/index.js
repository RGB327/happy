require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");

const { pool, initDb } = require("./db");
const { signToken, requireAuth } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// ---- helpers ----

async function getLatestMoodFeed() {
  const [rows] = await pool.query(`
    SELECT u.username, m.mood, m.message, m.created_at
    FROM moods m
    JOIN users u ON u.id = m.user_id
    WHERE m.id IN (
      SELECT MAX(id) FROM moods GROUP BY user_id
    )
    ORDER BY m.created_at DESC
  `);
  return rows;
}

// ---- auth routes ----

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password || password.length < 4) {
      return res
        .status(400)
        .json({ error: "아이디와 4자 이상의 비밀번호를 입력해주세요." });
    }

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [username, passwordHash]
    );

    const user = { id: result.insertId, username };
    res.json({ token: signToken(user), username: user.username });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    const user = rows[0];

    if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
      return res
        .status(401)
        .json({ error: "아이디 또는 비밀번호가 틀렸습니다." });
    }

    res.json({ token: signToken(user), username: user.username });
  })
);

// ---- mood routes ----

// 전체 공개 피드 - 로그인 없이 조회 가능
app.get(
  "/api/mood/feed",
  asyncHandler(async (req, res) => {
    res.json(await getLatestMoodFeed());
  })
);

app.get(
  "/api/mood/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT mood, message, created_at FROM moods WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [req.user.id]
    );
    res.json(rows[0] || null);
  })
);

app.post(
  "/api/mood",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { mood, message } = req.body || {};
    if (!mood) return res.status(400).json({ error: "mood 값이 필요합니다." });

    await pool.query(
      "INSERT INTO moods (user_id, mood, message) VALUES (?, ?, ?)",
      [req.user.id, mood, message || null]
    );

    const entry = {
      username: req.user.username,
      mood,
      message: message || null,
      created_at: new Date().toISOString(),
    };

    io.emit("mood:update", entry);
    res.json(entry);
  })
);

// ---- realtime ----

io.on("connection", async (socket) => {
  socket.emit("feed:init", await getLatestMoodFeed());
});

// ---- error handling ----

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

// ---- startup ----

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`happy-server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB 초기화 실패:", err);
    process.exit(1);
  });
