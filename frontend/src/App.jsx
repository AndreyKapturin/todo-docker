import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "/api";

async function request(path, options = {}, token) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "Произошла ошибка");
  return data;
}

function AuthScreen({ onAuthenticated }) {
  const [isRegistering, setIsRegistering] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setIsSending(true);
    setError("");
    try {
      const data = await request(`/auth/${isRegistering ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("todo-token", data.token);
      onAuthenticated(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">✓</span><span>Focus space</span></div>
        <p className="eyebrow">{isRegistering ? "НОВЫЙ АККАУНТ" : "С ВОЗВРАЩЕНИЕМ"}</p>
        <h1>{isRegistering ? "Создайте аккаунт" : "Войдите в пространство"}</h1>
        <p className="auth-subtitle">Логин и пароль — без email. Общайтесь с людьми в личных чатах.</p>
        {error && <div className="notice">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label>Логин<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="например, anna" autoComplete="username" required /></label>
          <label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="минимум 6 символов" autoComplete={isRegistering ? "new-password" : "current-password"} required /></label>
          <button className="primary-button auth-submit" disabled={isSending}>{isSending ? "Подождите..." : isRegistering ? "Зарегистрироваться" : "Войти"}</button>
        </form>
        <button className="text-button" onClick={() => { setIsRegistering(!isRegistering); setError(""); }}>
          {isRegistering ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("todo-token"));
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("people");
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    request("/auth/me", {}, token).then((data) => setUser(data.user)).catch(() => {
      localStorage.removeItem("todo-token");
      setToken(null);
    }).finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    request(`/users?search=${encodeURIComponent(search)}`, {}, token).then(setPeople).catch((requestError) => setError(requestError.message));
  }, [token, user, search]);

  useEffect(() => {
    if (!token || !user || !selectedPerson) return;
    setMessages([]);
    request(`/messages/${selectedPerson.id}`, {}, token).then(setMessages).catch((requestError) => setError(requestError.message));
  }, [token, user, selectedPerson]);

  useEffect(() => {
    if (!token || !user) return undefined;
    const stream = new EventSource(`${API}/messages/stream?token=${encodeURIComponent(token)}`);
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (!selectedPerson || (message.sender_id !== selectedPerson.id && message.recipient_id !== selectedPerson.id)) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    };
    stream.addEventListener("message", onMessage);
    stream.onerror = () => setError("Соединение с сообщениями прервано. Повторяем подключение...");
    return () => { stream.removeEventListener("message", onMessage); stream.close(); };
  }, [token, user, selectedPerson]);

  useEffect(() => {
    if (!token || !user) return;
    request("/todos", {}, token).then(setTodos).catch((requestError) => setError(requestError.message));
  }, [token, user]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!selectedPerson || !content.trim()) return;
    setIsSending(true);
    setError("");
    try {
      const message = await request("/messages", { method: "POST", body: JSON.stringify({ recipientId: selectedPerson.id, content: content.trim() }) }, token);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setContent("");
    } catch (requestError) { setError(requestError.message); } finally { setIsSending(false); }
  }

  async function logout() {
    await request("/auth/logout", { method: "POST" }, token).catch(() => {});
    localStorage.removeItem("todo-token");
    setToken(null);
    setUser(null);
  }

  async function add(event) {
    event.preventDefault();
    if (!title.trim()) return;
    await request("/todos", { method: "POST", body: JSON.stringify({ title: title.trim() }) }, token);
    setTitle("");
    setTodos(await request("/todos", {}, token));
  }

  async function toggle(id) {
    await request(`/todos/${id}`, { method: "PATCH" }, token);
    setTodos(await request("/todos", {}, token));
  }

  async function remove(id) {
    await request(`/todos/${id}`, { method: "DELETE" }, token);
    setTodos(await request("/todos", {}, token));
  }

  if (!token || !user) return isLoading ? <div className="loading auth-loading">Загружаем...</div> : <AuthScreen onAuthenticated={(data) => { setToken(data.token); setUser(data.user); }} />;

  const openTodos = useMemo(() => todos.filter((todo) => !todo.done).length, [todos]);
  const tabs = [
    { id: "people", label: "Люди", icon: "◉" },
    { id: "tasks", label: "Задачи", icon: "✓" },
    { id: "settings", label: "Настройки", icon: "⚙" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">✓</span><span>Focus space</span></div>
        <nav className="tabs" aria-label="Основная навигация">
          {tabs.map((tab) => <button className={`tab ${activeTab === tab.id ? "tab-active" : ""}`} key={tab.id} onClick={() => setActiveTab(tab.id)}><span className="tab-icon">{tab.icon}</span><span>{tab.label}</span></button>)}
        </nav>
        <div className="sidebar-footer"><span className="online-dot" /> Вы вошли как <strong>{user.username}</strong></div>
      </aside>
      <main className="content">
        <header className="topbar"><div><p className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</p><h1>{tabs.find((tab) => tab.id === activeTab).label}</h1></div><div className="avatar">{user.username[0].toUpperCase()}</div></header>
        {error && <div className="notice">{error}</div>}
        {activeTab === "people" && (
          <section className="chat-layout">
            <div className="panel people-panel">
              <div className="section-heading"><div><h2>Люди</h2><p>Найдите человека и начните личный чат</p></div></div>
              <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по логину..." aria-label="Поиск людей" />
              <div className="people-list">{people.length === 0 ? <div className="empty">Никого не нашли</div> : people.map((person) => <button className={`person ${selectedPerson?.id === person.id ? "person-active" : ""}`} key={person.id} onClick={() => setSelectedPerson(person)}><span className="avatar small-avatar">{person.username[0].toUpperCase()}</span><strong>{person.username}</strong></button>)}</div>
            </div>
            <section className="panel chat-panel">
              {!selectedPerson ? <div className="chat-placeholder"><span>◌</span><h2>Выберите собеседника</h2><p>Ваши сообщения видите только вы и получатель.</p></div> : <>
                <div className="chat-heading"><div className="avatar small-avatar">{selectedPerson.username[0].toUpperCase()}</div><div><h2>{selectedPerson.username}</h2><p>Личный чат</p></div></div>
                <div className="message-list">{messages.length === 0 ? <div className="empty">Начните разговор первым.</div> : messages.map((message) => <article className={`message ${message.sender_id === user.id ? "message-own" : ""}`} key={message.id}><div className="message-avatar">{message.author[0].toUpperCase()}</div><div><div className="message-meta"><strong>{message.author}</strong><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.content}</p></div></article>)}</div>
                <form onSubmit={sendMessage} className="message-composer"><input value={content} onChange={(event) => setContent(event.target.value)} placeholder={`Написать ${selectedPerson.username}...`} aria-label="Сообщение" /><button className="primary-button" disabled={isSending}>{isSending ? "..." : "Отправить"}</button></form>
              </>}
            </section>
          </section>
        )}
        {activeTab === "tasks" && <section className="panel"><div className="section-heading"><div><h2>Мой план</h2><p>{openTodos} активных задач</p></div></div><form onSubmit={add} className="composer"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Добавить новую задачу..." aria-label="Название задачи" /><button className="primary-button">Добавить</button></form><div className="task-list">{todos.length === 0 ? <div className="empty">Пока нет задач. Добавьте первую выше.</div> : todos.map((todo) => <div className={`task ${todo.done ? "task-done" : ""}`} key={todo.id}><input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} aria-label={`Отметить: ${todo.title}`} /><span>{todo.title}</span><button className="icon-button" onClick={() => remove(todo.id)} aria-label={`Удалить: ${todo.title}`}>×</button></div>)}</div></section>}
        {activeTab === "settings" && <section className="panel settings-panel"><h2>Настройки</h2><p>Ваш логин: <strong>{user.username}</strong></p><button className="secondary-button" onClick={logout}>Выйти из аккаунта</button></section>}
      </main>
    </div>
  );
}
