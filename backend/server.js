const express = require("express");
const cors = require("cors");
const products = require("./data/products");
const { searchProducts, getProductDetails, addToCart, getCart, } = require("./tools/productTools");

const app = express();

app.use(cors());
app.use(express.json());

const tools = [
  {
    type: "function",

    function: {
      name: "searchProducts",

      description:
        "Search the merchant product catalog based on category and maximum price.",

      parameters: {
        type: "object",

        properties: {
          category: {
            type: "string",
            description: "The product category, such as laptop or phone.",
          },

          maxPrice: {
            type: "number",
            description: "The maximum price the customer wants to spend.",
          },
        },

        required: [],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "getProductDetails",

      description:
        "Get detailed information about a specific product using its product ID.",

      parameters: {
        type: "object",

        properties: {
          productId: {
            type: "string",
            description: "The ID of the product to get details for.",
          },
        },

        required: ["productId"],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "addToCart",

      description:
        "Add a product to the customer's shopping cart. Use this only when the customer explicitly asks to add a product to their cart.",

      parameters: {
        type: "object",

        properties: {
          productId: {
            type: "string",
            description: "The ID of the product to add.",
          },

          quantity: {
            type: "number",
            description: "The number of units the customer wants to add.",
          },
        },

        required: ["productId"],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "getCart",

      description:
        "Get the current contents of the customer's shopping cart, including quantities and subtotals.",

      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

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
              role: "system",
              content:
                "You are AIKart, an AI shopping assistant for an Indian merchant. All product prices are in Indian Rupees (INR/₹). Never refer to prices as Yuan, RMB, or USD.",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
          tools,

          stream: false,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();

    const message = data.choices[0].message;

    console.log("Qwen response:");
    console.dir(message, { depth: null });


    if (message.tool_calls?.length > 0) {
      const toolCall = message.tool_calls[0];
      const toolName = toolCall.function.name;
      console.log("Tool requested:", toolName);
      const toolArguments = JSON.parse(
        toolCall.function.arguments
      );
      console.log("Tool arguments:", toolArguments);
      let toolResult;

      if (toolName === "searchProducts") {
        toolResult = searchProducts(toolArguments);
      } else if (toolName === "getProductDetails") {
        toolResult = getProductDetails(toolArguments);
      } else if (toolName === "addToCart") {
        toolResult = addToCart(toolArguments);
      } else if (toolName === "getCart") {
        toolResult = getCart();
      } else {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      console.log("Tool result:");
      console.log(toolResult);

      const toolMessage = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      };

      const secondResponse = await fetch(
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
                role: "system",
                content:
                  "You are AIKart, an AI shopping assistant for an Indian merchant. All product prices are in Indian Rupees (INR/₹). Never refer to prices as Yuan, RMB, or USD.",
              },
              {
                role: "user",
                content: userMessage,
              },

              {
                role: "assistant",
                tool_calls: message.tool_calls,
              },

              toolMessage,
            ],

            stream: false,
          }),
        }
      );

      const secondData = await secondResponse.json();

      const finalMessage =
        secondData.choices[0].message.content;

      console.log("Final AI response:");
      console.log(finalMessage);

      res.json({
        message: finalMessage,
      });

      return;

    }
    res.json({
      message: message.content
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