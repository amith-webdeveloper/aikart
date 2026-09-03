import { useState } from "react";
import { sendChatMessage } from "./api/apiClient";
import { getSessionId } from "./session/session";
import "./App.css";
import ChatMessage from "./components/ChatMessage";

function App() {
  const [sessionId] = useState(() => getSessionId());
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  async function sendMessage() {
    if (message.trim() === "") {
      return;
    }

    const userMessage = message.trim();

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "user",
        content: userMessage,
      },
    ]);

    setMessage("");

    const data = await sendChatMessage(
      sessionId,
      userMessage
    );

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "assistant",
        content: data.message,
        products: data.products || [],
      },
    ]);
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>AIKart</h1>
          <p>Your AI Shopping Assistant</p>
        </div>

        <nav className="sidebar-nav">
          <button>Order tracking</button>
          <button>Tailored suggestions</button>
          <button>Answers & questions</button>
          <button>Private & secure</button>
          <button>Cost savings</button>
        </nav>

        <button className="logout-button">Logout</button>
      </aside>

      <main className="chat">
        <header className="chat-header">
          <h2>Chat</h2>
        </header>

        <div className="messages">
          {messages.map((item, index) => (
            <ChatMessage
              key={index}
              role={item.role}
              content={item.content}
            />
          ))}
        </div>

        <form className="composer">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask AIKart anything..."
          />

          <button type="button" onClick={sendMessage}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;