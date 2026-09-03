import { useState } from "react";
import { sendChatMessage } from "./api/apiClient";
import { getSessionId } from "./session/session";

function App() {
  const [sessionId] = useState(() => getSessionId());
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");

  async function sendMessage() {
    if (message.trim() === "") {
      return;
    }

    const data = await sendChatMessage(
      sessionId,
      message
    );

    setResponse(data.message);
  }
  return (
    <div>
      <h1>AIKart</h1>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask AIKart something..."
      />

      <button onClick={sendMessage}>
        Send
      </button>

      <p>{response}</p>
    </div>
  );
}

export default App;