import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());

await pool.query(`
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL CHECK (char_length(trim(text)) > 0),
    sender TEXT NOT NULL DEFAULT 'me',
    author TEXT NOT NULL DEFAULT 'Вы',
    created_at TIMESTAMPTZ DEFAULT now()
  )
`);

const { rows: messageCount } = await pool.query("SELECT COUNT(*)::int AS count FROM messages");
if (messageCount[0].count === 0) {
  await pool.query(
    "INSERT INTO messages (text, sender, author, created_at) VALUES ($1, $2, $3, now() - interval '18 minutes'), ($4, $5, $6, now() - interval '7 minutes'), ($7, $8, $9, now() - interval '5 minutes')",
    [
      "Привет! Давайте обсудим последние новости по проекту.", "other", "Ирина",
      "Макеты уже готовы, можно посмотреть в Figma. Я добавила комментарии к основным экранам.", "other", "Ирина",
      "Отлично, посмотрю сегодня. Спасибо!", "me", "Вы",
    ],
  );
}

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/messages", async (req, res) => {
  const { rows } = await pool.query("SELECT id, text, sender, author, created_at FROM messages ORDER BY created_at ASC");
  res.json(rows);
});
app.post("/api/messages", async (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "text required" });
  const { rows } = await pool.query(
    "INSERT INTO messages (text) VALUES ($1) RETURNING id, text, sender, author, created_at",
    [text],
  );
  res.status(201).json(rows[0]);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend on :${port}`));
