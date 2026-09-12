import express from "express";
import cors from "cors";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const messageClients = new Set();

const app = express();
app.use(cors());
app.use(express.json());

// Создаём таблицу при старте
await pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
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

function broadcastMessage(message) {
  const payload = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
  for (const client of messageClients) {
    client.write(payload);
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/todos", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM todos ORDER BY id DESC");
  res.json(rows);
});

app.get("/api/messages", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM messages ORDER BY created_at ASC, id ASC"
  );
  res.json(rows);
});

app.get("/api/messages/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");
  messageClients.add(res);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    messageClients.delete(res);
  });
});

app.post("/api/messages", async (req, res) => {
  const author = typeof req.body.author === "string" ? req.body.author.trim() : "";
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!author || !content) {
    return res.status(400).json({ error: "author and content required" });
  }

  const { rows } = await pool.query(
    "INSERT INTO messages (author, content) VALUES ($1, $2) RETURNING *",
    [author, content]
  );
  broadcastMessage(rows[0]);
  res.status(201).json(rows[0]);
});

app.post("/api/todos", async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const { rows } = await pool.query(
    "INSERT INTO todos (title) VALUES ($1) RETURNING *",
    [title]
  );
  res.status(201).json(rows[0]);
});

app.patch("/api/todos/:id", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    "UPDATE todos SET done = NOT done WHERE id = $1 RETURNING *",
    [id]
  );
  res.json(rows[0]);
});

app.delete("/api/todos/:id", async (req, res) => {
  await pool.query("DELETE FROM todos WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend on :${port}`));