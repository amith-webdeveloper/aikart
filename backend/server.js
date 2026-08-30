const express = require("express");
const cors = require("cors");
const products = require("./data/products");
const { searchProducts, getProductDetails, addToCart, getCart, removeFromCart, resolveProduct, getProductAttribute } = require("./tools/productTools");

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
  {
    type: "function",

    function: {
      name: "getProductAttribute",

      description:
        "Get one specific product attribute directly from the merchant catalog. Use this when the customer asks about a specific product attribute such as processor, RAM, storage, display, price, stock, rating, brand, touchscreen, GPU, battery, or another attribute. Never guess an attribute that is not returned by this tool.",

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

          attribute: {
            type: "string",
            description:
              "The exact product attribute the customer is asking about, such as processor, ram, storage, display, price, stock, rating, brand, or touchscreen.",
          },
        },

        required: ["attribute"],
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

STRICT CATALOG RULES:

- All prices are in Indian Rupees (INR/₹).
- Never refer to prices as Yuan, RMB, or USD.
- Never invent products or product information.
- Never invent reviews, ratings, specifications, brands, stock levels, discounts, delivery information, or other product attributes.
- Only state product facts that are explicitly present in tool results.
- Do not use your general knowledge to fill missing product information.
- If a customer asks about an attribute that is not present in the tool result, clearly say that the information is not available in the merchant catalog.
- Never guess whether a product has a feature.
- Product IDs and internal matching information are private. Never expose them to the customer.
- Never expose internal confidence scores.
- Never claim an action was completed unless the corresponding tool returned success.

PRODUCT RESOLUTION:

- When a customer refers to a product by name and the exact product ID is not known, use resolveProduct.
- resolveProduct is an internal lookup step, not a final customer-facing action.
- After successful resolution, continue with the tool required to fulfill the customer's original request.

CART:

- Only modify the cart when the customer explicitly asks.
- Respect stock limits returned by the backend.
- Never invent prices or quantities.

ATTRIBUTE LOOKUP RULES:

- When getProductAttribute returns available=true, you may state the returned value.
- When getProductAttribute returns available=false, the attribute is UNKNOWN.
- available=false does NOT mean the attribute is false.
- Never convert an unavailable attribute into "yes" or "no".
- Never infer an attribute from a product category, description, specifications, or general knowledge.
- For unavailable attributes, tell the customer that the merchant catalog does not provide that information.

When answering the customer, be concise and natural.
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
          toolResult = searchProducts(toolArguments);

        } else if (toolName === "getProductDetails") {
          toolResult = getProductDetails(toolArguments);

        } else if (toolName === "addToCart") {
          toolResult = addToCart(toolArguments);

        } else if (toolName === "getCart") {
          toolResult = getCart();

        } else if (toolName === "removeFromCart") {
          toolResult = removeFromCart(toolArguments);

        } else if (toolName === "resolveProduct") {
          toolResult = resolveProduct(toolArguments);

        } else if (toolName === "getProductAttribute") {
          toolResult = getProductAttribute(toolArguments);

        } else {
          throw new Error(`Unknown tool: ${toolName}`);
        }


        console.log("Tool result:");
        console.dir(toolResult, { depth: null });

        // If the requested product attribute is not available,
        // do not let the LLM guess the answer.
        if (
          toolName === "getProductAttribute" &&
          toolResult.available === false
        ) {
          console.log(
            "Attribute unavailable. Returning grounded response."
          );

          return res.json({
            message: toolResult.customerAnswer,
          });
        }

        // Give tool result back to Qwen
        let toolContent = toolResult;

        if (toolName === "resolveProduct") {
          toolContent = {
            ...toolResult,
            instruction:
              "This is an internal product resolution result. Do not show product IDs or internal matching information to the customer. Continue with the tool required to fulfill the customer's original request.",
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