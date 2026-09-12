import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const API = "/api";

const conversations = [
  { id: "team", name: "Команда продукта", preview: "Ирина: Макеты уже готовы", time: "10:42", initials: "КП", color: "violet", unread: 3, online: true },
  { id: "design", name: "Дизайн-отдел", preview: "Отправила новую версию", time: "Вчера", initials: "ДО", color: "blue", unread: 0 },
  { id: "alex", name: "Алексей Морозов", preview: "Созвонимся после обеда?", time: "Вчера", initials: "АМ", color: "orange", unread: 0, online: true },
  { id: "support", name: "Поддержка", preview: "Мы получили ваш запрос", time: "Пн", initials: "П", color: "green", unread: 0 },
];

const fallbackMessages = [
  { id: "welcome", text: "Привет! Давайте обсудим последние новости по проекту.", sender: "other", author: "Ирина", created_at: "2026-09-12T10:31:00Z" },
  { id: "brief", text: "Макеты уже готовы, можно посмотреть в Figma. Я добавила комментарии к основным экранам.", sender: "other", author: "Ирина", created_at: "2026-09-12T10:42:00Z" },
  { id: "mine", text: "Отлично, посмотрю сегодня. Спасибо!", sender: "me", author: "Вы", created_at: "2026-09-12T10:44:00Z" },
];

function formatTime(value) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("team");
  const endRef = useRef(null);
  const activeConversation = conversations.find((item) => item.id === activeId) || conversations[0];

  const filteredConversations = useMemo(
    () => conversations.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  async function loadMessages() {
    try {
      const response = await fetch(`${API}/messages`);
      if (!response.ok) throw new Error("Не удалось загрузить сообщения");
      setMessages(await response.json());
      setError("");
    } catch {
      setMessages(fallbackMessages);
      setError("Сервер недоступен — показан демо-диалог");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMessages(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    const optimistic = { id: `local-${Date.now()}`, text, sender: "me", author: "Вы", created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("send failed");
      const saved = await response.json();
      setMessages((current) => current.map((message) => message.id === optimistic.id ? saved : message));
      setError("");
    } catch {
      setError("Сообщение сохранено локально. Проверьте подключение к серверу.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">✦</span><span>pulse</span></div>
        <div className="profile">
          <div className="avatar avatar-user">АК<span className="status-dot" /></div>
          <div><strong>Андрей К.</strong><span className="muted">В сети</span></div>
          <button className="icon-button" aria-label="Настройки">•••</button>
        </div>
        <button className="new-chat"><span>＋</span> Новый чат <kbd>⌘ K</kbd></button>
        <nav className="nav-links"><button className="nav-link active"><span>▰</span> Все сообщения <b>12</b></button><button className="nav-link"><span>☆</span> Избранное</button><button className="nav-link"><span>⌁</span> Архив</button></nav>
        <div className="conversation-heading"><span>Сообщения</span><button className="icon-button" aria-label="Добавить чат">＋</button></div>
        <label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" /></label>
        <div className="conversation-list">
          {filteredConversations.map((conversation) => (
            <button className={`conversation ${activeId === conversation.id ? "selected" : ""}`} key={conversation.id} onClick={() => setActiveId(conversation.id)}>
              <div className={`avatar avatar-${conversation.color}`}>{conversation.initials}{conversation.online && <span className="status-dot" />}</div>
              <div className="conversation-copy"><div><strong>{conversation.name}</strong><time>{conversation.time}</time></div><div><span>{conversation.preview}</span>{conversation.unread > 0 && <b className="unread">{conversation.unread}</b>}</div></div>
            </button>
          ))}
        </div>
        <div className="sidebar-footer"><span className="help-icon">?</span><span>Помощь и поддержка</span><span className="version">v1.0</span></div>
      </aside>

      <section className="chat">
        <header className="chat-header">
          <div className={`avatar avatar-${activeConversation.color}`}>{activeConversation.initials}<span className="status-dot" /></div>
          <div><h1>{activeConversation.name}</h1><span className="muted">{activeConversation.online ? "4 участника · В сети" : "8 участников"}</span></div>
          <div className="header-actions"><button className="icon-button" aria-label="Поиск">⌕</button><button className="icon-button" aria-label="Видеозвонок">▣</button><button className="icon-button" aria-label="Еще">•••</button></div>
        </header>
        <div className="message-area">
          <div className="date-divider"><span>Сегодня, 12 сентября</span></div>
          {error && <div className="notice">{error}</div>}
          {loading ? <div className="empty-state">Загружаем сообщения…</div> : messages.map((message) => (
            <div className={`message-row ${message.sender === "me" ? "mine" : ""}`} key={message.id}>
              {message.sender !== "me" && <div className="mini-avatar avatar-violet">ИР</div>}
              <div className="message-content">{message.sender !== "me" && <span className="author">{message.author}</span>}<div className="bubble">{message.text}</div><time>{formatTime(message.created_at)} {message.sender === "me" && <span className="check">✓✓</span>}</time></div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" className="attach" aria-label="Прикрепить файл">＋</button>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напишите сообщение..." />
          <button type="button" className="emoji" aria-label="Добавить эмодзи">☺</button>
          <button className="send" aria-label="Отправить сообщение" disabled={!draft.trim() || sending}>➤</button>
        </form>
      </section>
    </main>
  );
}
