import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = '/api';

export default function App() {
  const [activeTab, setActiveTab] = useState("tasks");
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState([]);
  const [author, setAuthor] = useState(() => localStorage.getItem("todo-author") || "");
  const [content, setContent] = useState("");
  const [messageError, setMessageError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  async function loadTodos() {
    const response = await fetch(`${API}/todos`);
    if (!response.ok) throw new Error("Не удалось загрузить задачи");
    setTodos(await response.json());
  }

  async function loadMessages() {
    const response = await fetch(`${API}/messages`);
    if (!response.ok) throw new Error("Не удалось загрузить сообщения");
    setMessages(await response.json());
  }

  useEffect(() => {
    Promise.all([loadTodos(), loadMessages()])
      .catch((error) => setMessageError(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const stream = new EventSource(`${API}/messages/stream`);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
    };
    stream.addEventListener("message", onMessage);
    stream.onerror = () => setMessageError("Соединение с сообщениями прервано. Повторяем подключение...");
    return () => {
      stream.removeEventListener("message", onMessage);
      stream.close();
    };
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const response = await fetch(`${API}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) return;
    setTitle("");
    await loadTodos();
  }

  async function toggle(id) {
    await fetch(`${API}/todos/${id}`, { method: "PATCH" });
    await loadTodos();
  }

  async function remove(id) {
    await fetch(`${API}/todos/${id}`, { method: "DELETE" });
    await loadTodos();
  }

  async function sendMessage(e) {
    e.preventDefault();
    const trimmedAuthor = author.trim();
    const trimmedContent = content.trim();
    if (!trimmedAuthor || !trimmedContent) return;
    setIsSending(true);
    setMessageError("");
    try {
      const response = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: trimmedAuthor, content: trimmedContent }),
      });
      if (!response.ok) throw new Error("Не удалось отправить сообщение");
      localStorage.setItem("todo-author", trimmedAuthor);
      setContent("");
    } catch (error) {
      setMessageError(error.message);
    } finally {
      setIsSending(false);
    }
  }

  const openTodos = useMemo(() => todos.filter((todo) => !todo.done).length, [todos]);
  const tabs = [
    { id: "tasks", label: "Задачи", icon: "✓" },
    { id: "messages", label: "Сообщения", icon: "◌", badge: messages.length },
    { id: "settings", label: "Настройки", icon: "⚙" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">✓</span><span>Focus space</span></div>
        <nav className="tabs" aria-label="Основная навигация">
          {tabs.map((tab) => (
            <button
              className={`tab ${activeTab === tab.id ? "tab-active" : ""}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge ? <span className="badge">{tab.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="online-dot" /> Синхронизация включена</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><p className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</p><h1>{tabs.find((tab) => tab.id === activeTab).label}</h1></div>
          <div className="avatar">{(author.trim()[0] || "U").toUpperCase()}</div>
        </header>

        {messageError && <div className="notice">{messageError}</div>}
        {isLoading ? <div className="loading">Загружаем данные...</div> : (
          <>
            {activeTab === "tasks" && (
              <section className="panel">
                <div className="section-heading"><div><h2>Мой план</h2><p>{openTodos} активных задач</p></div></div>
                <form onSubmit={add} className="composer">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Добавить новую задачу..." aria-label="Название задачи" />
                  <button className="primary-button" type="submit">Добавить</button>
                </form>
                <div className="task-list">
                  {todos.length === 0 ? <div className="empty">Пока нет задач. Добавьте первую выше.</div> : todos.map((todo) => (
                    <div className={`task ${todo.done ? "task-done" : ""}`} key={todo.id}>
                      <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} aria-label={`Отметить: ${todo.title}`} />
                      <span>{todo.title}</span>
                      <button className="icon-button" onClick={() => remove(todo.id)} aria-label={`Удалить: ${todo.title}`}>×</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {activeTab === "messages" && (
              <section className="panel messages-panel">
                <div className="section-heading"><div><h2>Командный чат</h2><p><span className="online-dot" /> Сообщения приходят в реальном времени</p></div></div>
                <div className="message-list">
                  {messages.length === 0 ? <div className="empty">Здесь пока тихо. Напишите первое сообщение.</div> : messages.map((message) => (
                    <article className="message" key={message.id}>
                      <div className="message-avatar">{message.author[0].toUpperCase()}</div>
                      <div><div className="message-meta"><strong>{message.author}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.content}</p></div>
                    </article>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="message-composer">
                  <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Ваше имя" aria-label="Ваше имя" />
                  <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Написать сообщение..." aria-label="Сообщение" />
                  <button className="primary-button" type="submit" disabled={isSending}>{isSending ? "..." : "Отправить"}</button>
                </form>
              </section>
            )}
            {activeTab === "settings" && (
              <section className="panel settings-panel"><h2>Настройки</h2><p>Имя отображается в сообщениях и сохраняется только в этом браузере.</p><label>Ваше имя<input value={author} onChange={(e) => setAuthor(e.target.value)} onBlur={() => localStorage.setItem("todo-author", author.trim())} placeholder="Например, Анна" /></label></section>
            )}
          </>
        )}
      </main>
    </div>
  );
}