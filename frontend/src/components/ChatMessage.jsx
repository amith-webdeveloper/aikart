function ChatMessage({ role, content, products = [] }) {
  const isUser = role === "user";

  return (
    <div className={`chat-message ${isUser ? "user-message" : "assistant-message"}`}>
      <div className="message-label">
        {isUser ? "You" : "AIKart"}
      </div>

      <div className="message-content">
        {content}
      </div>
      {!isUser && products.length > 0 && (
        <div className="product-list">
          {products.map((product) => (
            <article className="product-card" key={product.name}>
              <div className="product-image">
                <img
                  src={product.image}
                  alt={product.name}
                />
              </div>

              <div className="product-card-content">
                <h3>{product.name}</h3>

                <p className="product-category">
                  {product.category}
                </p>

                <p className="product-price">
                  ₹{product.price.toLocaleString("en-IN")}
                </p>

                <p className="product-rating">
                  ★ {product.rating}
                </p>

                <p className="product-description">
                  {product.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatMessage;