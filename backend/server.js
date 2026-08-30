const express = require("express");
const cors = require("cors");
const products = require("./data/products");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/products", (req, res) => {
  res.json(products);
});

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;

  console.log("User:", userMessage);

  try {
    const response = await fetch(
      "http://localhost:11434/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "qwen2.5:3b-instruct",

          messages: [
            {
              role: "user",
              content: userMessage,
            },
          ],

          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();

    const aiMessage = data.choices[0].message.content;

    console.log("AI:", aiMessage);

    res.json({
      message: aiMessage,
    });

  } catch (error) {
    console.error("LLM request failed:", error);

    res.status(500).json({
      error: "Failed to get response from AI",
    });
  }
});

app.listen(3000, () => {
  console.log("AIKart backend running on http://localhost:3000");
});