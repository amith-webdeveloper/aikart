const express = require("express");
const cors = require("cors");
const products = require("./data/products");
const { searchProducts, getProductDetails, addToCart, getCart, removeFromCart, resolveProduct } = require("./tools/productTools");

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
        "Get detailed information about a specific product. The customer can refer to the product by its name.",

      parameters: {
        type: "object",

        properties: {
          productName: {
            type: "string",
            description:
              "The product name as mentioned by the customer.",
          },

          productId: {
            type: "string",
            description:
              "Internal product ID if already known.",
          },
        },

        required: [],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "addToCart",

      description:
        "Add a product to the customer's cart. Use this only when the customer explicitly asks to add a product.",

      parameters: {
        type: "object",

        properties: {
          productName: {
            type: "string",
            description:
              "The product name mentioned by the customer.",
          },

          productId: {
            type: "string",
            description:
              "Internal product ID if already known.",
          },

          quantity: {
            type: "number",
            description:
              "The number of units the customer wants to add.",
          },
        },

        required: [],
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
  {
    type: "function",

    function: {
      name: "removeFromCart",

      description:
        "Remove a specific product from the customer's shopping cart. Use this only when the customer explicitly asks to remove the product.",

      parameters: {
        type: "object",

        properties: {
          productId: {
            type: "string",
            description: "The ID of the product to remove from the cart.",
          },
        },

        required: ["productId"],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "resolveProduct",

      description:
        "Internal lookup tool. Resolve a customer-provided product name to the correct catalog product ID. This is NOT a final customer-facing action. After successful resolution, continue using another tool to fulfill the customer's original request.",

      parameters: {
        type: "object",

        properties: {
          productName: {
            type: "string",
            description:
              "The product name as mentioned by the customer, including possible spelling mistakes.",
          },
        },

        required: ["productName"],
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

  const messages = [
    {
      role: "system",
      content: `
You are AIKart, an AI shopping assistant for an Indian merchant.

Rules:
- All prices are in Indian Rupees (INR/₹).
- Never refer to prices as Yuan, RMB, or USD.
- Never invent products or product information.
- Product IDs are internal and must never be shown to the customer.
- Product matching confidence is internal and must never be shown to the customer.
- When a customer asks about a product by name, use resolveProduct when the product ID is not known.
- resolveProduct is an internal lookup step. After successfully resolving a product, continue with the tool needed to fulfill the customer's original request.
- If the customer asks for product details, resolve the product first if necessary, then use getProductDetails.
- If the customer asks to add a product to the cart, resolve the product first if necessary, then use addToCart.
- Do not ask the customer to provide an internal product ID when they have provided a product name.
`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];

  try {
    // Agent loop
    while (true) {
      const response = await fetch(
        "http://localhost:11434/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            model: "qwen2.5:3b-instruct",
            messages,
            tools,
            stream: false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Ollama returned ${response.status}`
        );
      }

      const data = await response.json();

      const assistantMessage =
        data.choices[0].message;

      console.log("Qwen response:");
      console.dir(assistantMessage, { depth: null });

      // Add Qwen's response to conversation
      messages.push(assistantMessage);

      // NO MORE TOOLS → FINAL ANSWER

      if (!assistantMessage.tool_calls?.length) {
        console.log("Final AI response:");
        console.log(assistantMessage.content);

        return res.json({
          message: assistantMessage.content,
        });
      }

      // EXECUTE TOOL CALLS

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName =
          toolCall.function.name;

        const toolArguments = JSON.parse(
          toolCall.function.arguments
        );

        console.log(
          "Tool requested:",
          toolName
        );

        console.log(
          "Tool arguments:",
          toolArguments
        );

        let toolResult;

        if (toolName === "searchProducts") {
          toolResult =
            searchProducts(toolArguments);

        } else if (toolName === "getProductDetails") {
          toolResult =
            getProductDetails(toolArguments);

        } else if (toolName === "addToCart") {
          toolResult =
            addToCart(toolArguments);

        } else if (toolName === "getCart") {
          toolResult = getCart();

        } else if (toolName === "removeFromCart") {
          toolResult =
            removeFromCart(toolArguments);

        }
        else if (toolName === "resolveProduct") {
          toolResult =
            resolveProduct(toolArguments);

        } 
        else {
          throw new Error(
            `Unknown tool: ${toolName}`
          );
        }

        console.log("Tool result:");
        console.dir(toolResult, { depth: null });

        // Give tool result back to Qwen
        let toolContent = toolResult;

        if (toolName === "resolveProduct") {
          toolContent = {
            ...toolResult,
            instruction:
              "This is an internal product resolution result. Do not show the product ID or internal resolution details to the customer. Continue with the tool required to fulfill the customer's original request.",
          };
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolContent),
        });
      }

      // Loop continues.
      // Qwen gets the tool result and decides
      // whether another tool is needed or
      // whether it can give the final answer.
    }

  } catch (error) {
    console.error(
      "LLM request failed:",
      error
    );

    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to get response from AI",
      });
    }
  }
});

app.listen(3000, () => {
  console.log("AIKart backend running on http://localhost:3000");
});