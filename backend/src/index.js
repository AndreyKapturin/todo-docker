import express from "express";
import cors from "cors";
import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const messageClients = new Set();

const app = express();
app.use(cors());
app.use(express.json());

await pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`);
await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
  if (!token) return res.status(401).json({ error: "Требуется войти в аккаунт" });
  const { rows } = await pool.query(
    "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = $1",
    [token]
  );
  if (!rows[0]) return res.status(401).json({ error: "Сессия истекла, войдите снова" });
  req.user = rows[0];
  req.token = token;
  next();
}

function broadcastMessage(message) {
  const payload = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  for (const client of messageClients) {
    if (client.userId === message.sender_id || client.userId === message.recipient_id) {
      client.res.write(payload);
    }
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!/^[a-zа-яё0-9_.-]{3,32}$/iu.test(username)) {
    return res.status(400).json({ error: "Логин: 3–32 символа, только буквы, цифры, точка, дефис или _" });
  }
  if (password.length < 6) return res.status(400).json({ error: "Пароль должен содержать минимум 6 символов" });
  const result = await pool.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING RETURNING id, username",
    [username, hashPassword(password)]
  );
  if (!result.rows[0]) return res.status(409).json({ error: "Такой логин уже занят" });
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, result.rows[0].id]);
  res.status(201).json({ token, user: result.rows[0] });
});

app.post("/api/auth/login", async (req, res) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const { rows } = await pool.query("SELECT id, username, password_hash FROM users WHERE username = $1", [username]);
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, rows[0].id]);
  res.json({ token, user: { id: rows[0].id, username: rows[0].username } });
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE token = $1", [req.token]);
  res.status(204).end();
});

app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: req.user }));

app.get("/api/users", authenticate, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const { rows } = await pool.query(
    "SELECT id, username FROM users WHERE id <> $1 AND username LIKE $2 ORDER BY username LIMIT 50",
    [req.user.id, `%${search}%`]
  );
  res.json(rows);
});

app.get("/api/todos", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM todos ORDER BY id DESC");
  res.json(rows);
});

app.get("/api/messages/:userId", authenticate, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: "Некорректный пользователь" });
  const { rows } = await pool.query(
    `SELECT messages.id, messages.sender_id, messages.recipient_id, users.username AS author,
            messages.content, messages.created_at
     FROM messages JOIN users ON users.id = messages.sender_id
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY messages.created_at ASC, messages.id ASC`,
    [req.user.id, userId]
  );
  res.json(rows);
});

app.get("/api/messages/stream", authenticate, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  const client = { userId: req.user.id, res };
  messageClients.add(client);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    messageClients.delete(client);
  });
});

app.post("/api/messages", authenticate, async (req, res) => {
  const recipientId = Number(req.body.recipientId);
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!Number.isInteger(recipientId) || recipientId === req.user.id || !content) {
    return res.status(400).json({ error: "Получатель и сообщение обязательны" });
  }
  const { rows } = await pool.query(
    `INSERT INTO messages (author, sender_id, recipient_id, content)
     SELECT $1, $2, id, $3 FROM users WHERE id = $4
     RETURNING id, sender_id, recipient_id, author, content, created_at`,
    [req.user.username, req.user.id, content, recipientId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Пользователь не найден" });
  broadcastMessage(rows[0]);
  res.status(201).json(rows[0]);
});

app.post("/api/todos", authenticate, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const { rows } = await pool.query("INSERT INTO todos (title) VALUES ($1) RETURNING *", [title]);
  res.status(201).json(rows[0]);
});

app.patch("/api/todos/:id", authenticate, async (req, res) => {
  const { rows } = await pool.query("UPDATE todos SET done = NOT done WHERE id = $1 RETURNING *", [req.params.id]);
  res.json(rows[0]);
});

app.delete("/api/todos/:id", authenticate, async (req, res) => {
  await pool.query("DELETE FROM todos WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend on :${port}`));
