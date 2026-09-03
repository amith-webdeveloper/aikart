function ChatMessage({ role, content }) {
  const isUser = role === "user";

  return (
    <div className={`chat-message ${isUser ? "user-message" : "assistant-message"}`}>
      <div className="message-label">
        {isUser ? "You" : "AIKart"}
      </div>

      <div className="message-content">
        {content}
      </div>
    </div>
  );
}

export default ChatMessage;