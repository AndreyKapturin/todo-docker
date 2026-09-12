import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");

  async function load() {
    const r = await fetch(`${API}/api/todos`);
    setTodos(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch(`${API}/api/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    load();
  }

  async function toggle(id) {
    await fetch(`${API}/api/todos/${id}`, { method: "PATCH" });
    load();
  }

  async function remove(id) {
    await fetch(`${API}/api/todos/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 500, margin: "40px auto" }}>
      <h1>Todos</h1>
      <form onSubmit={add} style={{ display: "flex", gap: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что сделать?"
          style={{ flex: 1, padding: 8 }}
        />
        <button>Добавить</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 20 }}>
        {todos.map((t) => (
          <li key={t.id} style={{ display: "flex", gap: 8, padding: "6px 0" }}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
            <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none" }}>
              {t.title}
            </span>
            <button onClick={() => remove(t.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}