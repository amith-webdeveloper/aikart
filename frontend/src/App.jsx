import { useState } from "react";
import { sendChatMessage } from "./api/apiClient";
import { getSessionId } from "./session/session";
import "./App.css";
import ChatMessage from "./components/ChatMessage";

function App() {
  const [sessionId] = useState(() => getSessionId());
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
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

  if (selectedProduct) {
    return (
      <main className="product-details">
        <button
          className="product-details-back"
          onClick={() => setSelectedProduct(null)}
        >
          ← Back to chat
        </button>

        <div className="product-details-content">
          <div className="product-details-image">
            {selectedProduct.image ? (
              <img
                src={selectedProduct.image}
                alt={selectedProduct.name}
              />
            ) : (
              <span>No image</span>
            )}
          </div>

          <div className="product-details-info">
            <p className="product-details-category">
              {selectedProduct.category}
            </p>

            <h1>{selectedProduct.name}</h1>

            <p className="product-details-rating">
              ★ {selectedProduct.rating}
            </p>

            <p className="product-details-price">
              ₹{selectedProduct.price.toLocaleString("en-IN")}
            </p>

            <p className="product-details-description">
              {selectedProduct.description}
            </p>

            <div className="product-details-stock">
              {selectedProduct.stock > 0
                ? `${selectedProduct.stock} in stock`
                : "Out of stock"}
            </div>

            <div className="product-details-specifications">
              <h2>Specifications</h2>

              {Object.entries(
                selectedProduct.specifications || {}
              ).map(([key, value]) => (
                <div
                  className="specification-row"
                  key={key}
                >
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <button
              className="add-to-cart-button"
              disabled={selectedProduct.stock <= 0}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </main>
    );
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
              products={item.products}
              onProductClick={setSelectedProduct}
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