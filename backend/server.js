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
        "Search the merchant product catalog using only the filters explicitly provided by the customer. If the customer does not specify a category, do not invent one; omit the category parameter. If the customer only specifies a maximum price, search all product categories.",

      parameters: {
        type: "object",

        properties: {
          category: {
            type: "string",
            description: "Optional product category. Only provide this when the customer explicitly specifies a category such as laptop, phone, monitor, accessory, or audio. Never guess or invent a category.",
          },

          maxPrice: {
            type: "number",
            description: "Optional maximum price in Indian Rupees. Use this when the customer specifies a budget or maximum price.",
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
        "Get detailed information about a product ONLY when the customer asks for product information or specifications. Do NOT use this tool when the customer is asking to add, remove, or otherwise modify the cart.",

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
        "Add a product to the customer's cart when the customer explicitly asks to add, buy, or put a product in the cart. If the product name is known but the internal product ID is not known, first use resolveProduct. Do not ask for confirmation before adding when the customer has explicitly requested the add-to-cart action.",

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
        "Remove a product from the customer's cart. Provide the product name when the customer refers to the product by name. Provide the product ID only when the internal ID is already known. Never invent a product ID.",

      parameters: {
        type: "object",

        properties: {
          productId: {
            type: "string",
            description:
              "Internal product ID returned by the merchant backend. Never invent this ID.",
          },

          productName: {
            type: "string",
            description:
              "Product name mentioned by the customer, such as ProBook X.",
          },
        },

        required: [],
      },
    },
  },
  {
    type: "function",

    function: {
      name: "resolveProduct",

      description:
        "Internal lookup tool. Resolve a customer-provided product name to the correct catalog product ID. This is NOT a final customer-facing action. After successful resolution, continue using the tool required by the customer's original request. If the original request is to add the product to the cart, call addToCart next. If the original request is to remove the product from the cart, call removeFromCart next. Do not call getProductDetails unless the customer also requested product information. Never invent a product ID.",

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

function enforceSearchConstraints(userMessage, toolArguments) {
  const message = userMessage.toLowerCase();

  const enforcedArguments = {
    ...toolArguments,
  };

  // Explicit category constraints
  const categoryPatterns = [
    { category: "laptop", patterns: [/\blaptop(s)?\b/i] },
    { category: "phone", patterns: [/\bphone(s)?\b/i, /\bmobile(s)?\b/i] },
    { category: "monitor", patterns: [/\bmonitor(s)?\b/i, /\bscreen(s)?\b/i] },
    { category: "accessory", patterns: [/\baccessor(y|ies)\b/i] },
    { category: "audio", patterns: [/\baudio\b/i, /\bheadphone(s)?\b/i] },
  ];

  for (const { category, patterns } of categoryPatterns) {
    if (patterns.some((pattern) => pattern.test(message))) {
      enforcedArguments.category = category;
      break;
    }
  }

  // Explicit maximum budget
  const budgetMatch = message.match(
    /(?:under|below|less than|within|around|budget(?:\s+is)?)[^\d₹]*₹?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|thousand)?/i
  );

  if (budgetMatch) {
    let parsedBudget = Number(
      budgetMatch[1].replace(/,/g, "")
    );

    const unit = budgetMatch[2]?.toLowerCase();

    if (unit === "k" || unit === "thousand") {
      parsedBudget *= 1000;
    }

    if (Number.isFinite(parsedBudget)) {
      enforcedArguments.maxPrice = parsedBudget;
    }
  }

  return enforcedArguments;
}

function isExplicitCartAddRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  const message = userMessage.toLowerCase();

  /*
   * Explicit negation / denial of the cart request.
   *
   * Examples:
   * "I didn't explicitly ask"
   * "I did not ask"
   * "don't add it"
   * "do not add it"
   *
   * These must never authorize a cart mutation.
   */
  const hasNegatedCartIntent =
    /\b(didn't|did not|dont|don't|do not|not)\b.*\b(ask|want|authorize|approve|request)\b/i.test(
      message
    ) ||
    /\b(don't|do not|dont)\b.*\b(add|buy|purchase|put)\b/i.test(
      message
    );

  if (hasNegatedCartIntent) {
    return false;
  }

  /*
   * Positive explicit cart request.
   */
  return /\b(add|buy|purchase|put)\b.*\b(to|in|into)\b.*\b(cart|basket)\b/i.test(
    message
  );
}

function getRequestedQuantity(userMessage) {
  const quantityMatch = userMessage.match(
    /\b(?:add|buy|purchase|put)\s+(-?\d+(?:\.\d+)?)\b/i
  );

  if (!quantityMatch) {
    return {
      specified: false,
      quantity: 1,
    };
  }

  return {
    specified: true,
    quantity: Number(quantityMatch[1]),
  };
}

function getStorageInGB(storageValue) {
  if (typeof storageValue !== "string") {
    return null;
  }

  const value = storageValue.toLowerCase().trim();

  const match = value.match(
    /(\d+(?:\.\d+)?)\s*(tb|gb)/
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount)) {
    return null;
  }

  return unit === "tb"
    ? amount * 1024
    : amount;
}

function isUnqualifiedMostStorageRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  const message = userMessage.toLowerCase();

  const asksMostStorage =
    /\b(most|maximum|highest|largest)\b/.test(message) &&
    /\b(storage|space)\b/.test(message);

  if (!asksMostStorage) {
    return false;
  }

  // If the user already supplied a concrete search constraint,
  // let the normal search flow handle it.
  const hasExplicitConstraint =
    /\b(under|below|less than|within|budget|₹|\brs\.?|inr)\b/.test(message) ||
    /\b(laptop|phone|monitor|keyboard|mouse|ssd|headphone|accessory)\b/.test(message);

  return !hasExplicitConstraint;
}

function isWorthItRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  return /\b(worth it|worth buying|good value|value for money|good buy)\b/i
    .test(userMessage);
}

function hasUnsupportedEvaluationClaim(responseText) {
  if (typeof responseText !== "string") {
    return true;
  }

  const forbiddenPatterns = [
    /\bcompetitively priced\b/i,
    /\bcompetitive price\b/i,
    /\btop[- ]tier\b/i,
    /\bhigh[- ]performance\b/i,
    /\breliable\b/i,
    /\bgood investment\b/i,
    /\bbest value\b/i,
    /\bbest option\b/i,
    /\bgood performance\b/i,
    /\bpowerful device\b/i,
    /\baverage range\b/i,
    /\bmedium[- ]to[- ]high[- ]end\b/i,
  ];

  return forbiddenPatterns.some((pattern) =>
    pattern.test(responseText)
  );
}

function containsInternalProductId(responseText, productId) {
  if (
    typeof responseText !== "string" ||
    typeof productId !== "string" ||
    !productId
  ) {
    return false;
  }

  return (
    responseText.includes(productId) ||
    /\bproduct\s*id\b/i.test(responseText)
  );
}

function isInternalInformationRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  return (
    /\b(product\s*id|product\s*ids|internal\s+id|internal\s+ids)\b/i.test(
      userMessage
    ) ||
    /\b(confidence\s*score|confidence\s*scores|confidence)\b/i.test(
      userMessage
    ) ||
    /\b(internal\s+information|internal\s+system|internal\s+data)\b/i.test(
      userMessage
    )
  );
}

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (isInternalInformationRequest(userMessage)) {
    console.log(
      "Blocked internal information request."
    );

    return res.json({
      message:
        "I can't provide internal product IDs, confidence scores, or other internal system information.",
    });
  }


  if (isUnqualifiedMostStorageRequest(userMessage)) {
    console.log(
      "Unqualified most-storage request detected."
    );

    const searchArguments = {
      category: "laptop",
    };

    console.log(
      "Fallback search arguments:",
      searchArguments
    );

    const searchResult = searchProducts(searchArguments);

    if (
      !Array.isArray(searchResult) ||
      searchResult.length === 0
    ) {
      return res.json({
        message:
          "I couldn't find any relevant products with storage information in the catalog.",
      });
    }

    const productsWithStorage = searchResult
      .map((product) => {
        const storage =
          product.specifications?.storage;

        const storageGB =
          getStorageInGB(storage);

        return {
          product,
          storageGB,
        };
      })
      .filter(
        ({ storageGB }) =>
          storageGB !== null
      );

    if (productsWithStorage.length === 0) {
      return res.json({
        message:
          "The merchant catalog does not provide enough storage information to determine which product has the most storage.",
      });
    }

    const mostStorageProduct =
      productsWithStorage.reduce(
        (best, current) => {
          if (
            !best ||
            current.storageGB > best.storageGB
          ) {
            return current;
          }

          return best;
        },
        null
      );

    console.log(
      "Deterministically selected product with most storage:",
      {
        id: mostStorageProduct.product.id,
        name: mostStorageProduct.product.name,
        storage:
          mostStorageProduct.product.specifications?.storage,
        storageGB:
          mostStorageProduct.storageGB,
      }
    );

    return res.json({
      message:
        `${mostStorageProduct.product.name} has the most storage with ${mostStorageProduct.product.specifications.storage}.`,
    });
  }

  const addToCartMatch =
    userMessage.match(
      /\b(add|buy|purchase|put)\s+(-?\d+(?:\.\d+)?)\s+(.+?)\s+(?:to|in|into)\s+(?:my\s+)?(?:cart|basket)\b/i
    );
  const wantsAddToCart = isExplicitCartAddRequest(userMessage);

  const requestedQuantity = addToCartMatch
    ? Number(addToCartMatch[2])
    : 1;

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

TOOL SEQUENCING RULES:

- Preserve the customer's original intent throughout the entire tool-calling process.
- If the customer explicitly asks to add a product to the cart, resolve the product if necessary and then call addToCart. Do not call getProductDetails unless the customer also asked for product information.
- If the customer explicitly asks to remove a product, resolve the product if necessary and then call removeFromCart.
- Do not ask for confirmation when the customer has already explicitly requested the cart action.
- Do not perform an action the customer did not request.
`,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];

  try {
    let resolvedProductId = null;
    let resolvedProductName = null;
    let evaluationProduct = null;

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
        const finalAnswer =
          assistantMessage.content?.trim() || "";

        if (!finalAnswer) {
          console.log(
            "Blocked empty LLM response."
          );

          return res.json({
            message:
              "I can't provide internal product IDs, confidence scores, or other internal system information.",
          });
        }


        /*
         * INTERNAL PRODUCT ID LEAK PROTECTION
         *
         * Product IDs are merchant-internal information.
         * Never allow the LLM to expose them to the customer.
         */
        if (
          resolvedProductId &&
          containsInternalProductId(
            finalAnswer,
            resolvedProductId
          )
        ) {
          console.log(
            "Blocked internal product ID leakage."
          );

          console.log(
            "Rejected response:",
            finalAnswer
          );

          const detailsResult = getProductDetails({
            productId: resolvedProductId,
          });

          if (
            detailsResult.success &&
            detailsResult.product
          ) {
            const product =
              detailsResult.product;

            const processor =
              product.specifications?.processor;

            const ram =
              product.specifications?.ram;

            const storage =
              product.specifications?.storage;

            const display =
              product.specifications?.display;

            const facts = [
              `${product.name} is a ${product.category}.`,
              processor
                ? `It has an ${processor} processor.`
                : null,
              ram
                ? `It has ${ram} RAM.`
                : null,
              storage
                ? `It has ${storage}.`
                : null,
              display
                ? `It has a ${display} display.`
                : null,
              typeof product.price === "number"
                ? `It is priced at ₹${product.price.toLocaleString("en-IN")}.`
                : null,
              typeof product.rating === "number"
                ? `Its catalog rating is ${product.rating}.`
                : null,
            ].filter(Boolean);

            return res.json({
              message: facts.join(" "),
            });
          }

          return res.json({
            message:
              "I found the product, but I couldn't retrieve its catalog details.",
          });
        }


        /*
         * EVALUATION RESPONSE VALIDATION
         *
         * Qwen may still generate unsupported value/performance claims
         * even when the evaluation prompt explicitly forbids them.
         *
         * Do not return such a response directly to the customer.
         */
        if (
          isWorthItRequest(userMessage) &&
          hasUnsupportedEvaluationClaim(finalAnswer)
        ) {
          console.log(
            "Blocked unsupported product-evaluation claim."
          );

          console.log(
            "Rejected evaluation response:",
            finalAnswer
          );

          const product = evaluationProduct;

          if (product) {
            const processor =
              product.specifications?.processor;

            const ram =
              product.specifications?.ram;

            const storage =
              product.specifications?.storage;

            const display =
              product.specifications?.display;

            const facts = [
              `${product.name} is listed at ₹${product.price.toLocaleString("en-IN")}.`,
              processor ? `It has an ${processor} processor.` : null,
              ram ? `It has ${ram} RAM.` : null,
              storage ? `It has ${storage}.` : null,
              display ? `It has a ${display} display.` : null,
              typeof product.rating === "number"
                ? `Its catalog rating is ${product.rating}.`
                : null,
            ].filter(Boolean);

            return res.json({
              message:
                `${facts.join(" ")} ` +
                `Based only on the merchant catalog, these are the available product facts. ` +
                `However, the catalog does not provide benchmark results, battery information, ` +
                `competitor pricing, or other information needed to determine whether ` +
                `₹${product.price.toLocaleString("en-IN")} represents the best value.`,
            });
          }

          return res.json({
            message:
              "I couldn't provide a grounded product evaluation from the available merchant catalog information.",
          });
        }

        console.log("Final AI response:");
        console.log(finalAnswer);

        return res.json({
          message: finalAnswer,
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
          const safeSearchArguments = enforceSearchConstraints(
            userMessage,
            toolArguments
          );

          console.log(
            "Original search arguments:",
            toolArguments
          );

          console.log(
            "Enforced search arguments:",
            safeSearchArguments
          );

          toolResult = searchProducts(safeSearchArguments);

          /*
           * DETERMINISTIC CHEAPEST-PRODUCT SELECTION
           *
           * If the customer explicitly asks to add the cheapest
           * product, do not let the LLM choose which product is cheapest.
           */
          const isCheapestAddRequest =
            /\bcheapest\b/i.test(userMessage) &&
            isExplicitCartAddRequest(userMessage);

          if (
            isCheapestAddRequest &&
            Array.isArray(toolResult) &&
            toolResult.length > 0
          ) {
            const cheapestProduct = toolResult.reduce(
              (cheapest, product) => {
                if (
                  typeof product.price === "number" &&
                  (
                    !cheapest ||
                    product.price < cheapest.price
                  )
                ) {
                  return product;
                }

                return cheapest;
              },
              null
            );

            if (!cheapestProduct) {
              return res.json({
                message:
                  "I couldn't determine the cheapest product from the available catalog results.",
              });
            }

            console.log(
              "Deterministically selected cheapest product:",
              {
                id: cheapestProduct.id,
                name: cheapestProduct.name,
                price: cheapestProduct.price,
              }
            );

            const addResult = addToCart({
              productId: cheapestProduct.id,
              productName: cheapestProduct.name,
              quantity: requestedQuantity,
            });

            console.log(
              "Deterministic cheapest addToCart result:"
            );
            console.dir(addResult, { depth: null });

            if (addResult.success) {
              return res.json({
                message:
                  `${cheapestProduct.name} has been added to your cart.`,
              });
            }

            return res.json({
              message:
                addResult.error ||
                `I couldn't add ${cheapestProduct.name} to your cart.`,
            });
          }

          /*
           * DETERMINISTIC MOST-STORAGE SELECTION
           *
           * If the customer asks which matching product has
           * the most storage, do not let the LLM decide.
           */
          const isMostStorageRequest =
            /\b(most|maximum|highest)\b/i.test(userMessage) &&
            /\b(storage|space)\b/i.test(userMessage);

          if (
            isMostStorageRequest &&
            Array.isArray(toolResult) &&
            toolResult.length > 0
          ) {
            const productsWithStorage = toolResult
              .map((product) => {
                const storage =
                  product.specifications?.storage ||
                  product.description ||
                  product.name;

                const storageGB =
                  getStorageInGB(storage);

                return {
                  product,
                  storageGB,
                };
              })
              .filter(
                ({ storageGB }) =>
                  storageGB !== null
              );

            if (productsWithStorage.length === 0) {
              return res.json({
                message:
                  "The merchant catalog does not provide enough storage information to determine which product has the most storage.",
              });
            }

            const mostStorageProduct =
              productsWithStorage.reduce(
                (best, current) => {
                  if (
                    !best ||
                    current.storageGB > best.storageGB
                  ) {
                    return current;
                  }

                  return best;
                },
                null
              );

            console.log(
              "Deterministically selected product with most storage:",
              {
                id: mostStorageProduct.product.id,
                name: mostStorageProduct.product.name,
                storage:
                  mostStorageProduct.product.specifications
                    ?.storage,
                storageGB:
                  mostStorageProduct.storageGB,
              }
            );

            const selectedProduct =
              mostStorageProduct.product;

            const selectedStorage =
              selectedProduct.specifications?.storage ||
              selectedProduct.description ||
              selectedProduct.name;

            return res.json({
              message:
                `${selectedProduct.name} has the most storage with ${selectedStorage}.`,
            });
          }
        } else if (toolName === "getProductDetails") {
          toolResult = getProductDetails(toolArguments);

        } else if (toolName === "addToCart") {
          const explicitlyAuthorized =
            isExplicitCartAddRequest(userMessage);

          if (!explicitlyAuthorized) {
            console.log(
              "Blocked addToCart: customer did not explicitly request a cart addition."
            );

            toolResult = {
              success: false,
              error:
                "Cart addition is not authorized because the customer did not explicitly request adding or buying the product.",
              blocked: true,
            };
          } else {
            const requestedQuantity =
              getRequestedQuantity(userMessage);

            if (
              requestedQuantity.specified &&
              requestedQuantity.quantity <= 0
            ) {
              console.log(
                "Blocked addToCart: invalid requested quantity:",
                requestedQuantity.quantity
              );

              toolResult = {
                success: false,
                error:
                  "Quantity must be greater than 0.",
              };
            } else {
              const safeArguments = {
                ...toolArguments,
                quantity: requestedQuantity.specified
                  ? requestedQuantity.quantity
                  : 1,
              };

              console.log(
                "Validated addToCart arguments:",
                safeArguments
              );

              toolResult = addToCart(safeArguments);
            }
          }
        } else if (toolName === "getCart") {
          toolResult = getCart();

        } else if (toolName === "removeFromCart") {
          const safeRemoveArguments = {
            ...toolArguments,
          };

          // Never trust a product ID invented by the LLM.
          // If we already resolved the customer's product,
          // use the trusted catalog ID from the backend.
          if (resolvedProductId) {
            safeRemoveArguments.productId = resolvedProductId;
            delete safeRemoveArguments.productName;
          }

          console.log(
            "Validated removeFromCart arguments:",
            safeRemoveArguments
          );

          toolResult = removeFromCart(safeRemoveArguments);
        } else if (toolName === "resolveProduct") {
          const productName = toolArguments.productName || "";

          const isRecommendationRequest =
            /\b(need|want|looking for|suggest|recommend|recommendation|something|option|options|which|best|cheapest)\b/i.test(
              userMessage
            ) &&
            /\b(laptop|phone|monitor|accessory|audio|product|development|budget|under|around|below)\b/i.test(
              userMessage
            );
          const isEvaluationRequest =
            isWorthItRequest(userMessage);

          if (isEvaluationRequest) {
            console.log(
              "Product evaluation request detected."
            );

            toolResult = resolveProduct(toolArguments);

            if (!toolResult.success) {
              // Let the normal agent handle the failed resolution.
            } else {
              console.log(
                "Resolved product for evaluation:",
                toolResult
              );
            }
          } else if (isRecommendationRequest) {
            const safeSearchArguments = enforceSearchConstraints(
              userMessage,
              {}
            );

            console.log(
              "Resolution blocked: recommendation request detected."
            );

            console.log(
              "Fallback search arguments:",
              safeSearchArguments
            );

            toolResult = searchProducts(safeSearchArguments);
          } else {
            toolResult = resolveProduct(toolArguments);
          }
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
          if (toolResult.success) {
            resolvedProductId = toolResult.productId;
            resolvedProductName = toolResult.productName;
          }

          if (
            toolResult.success &&
            isWorthItRequest(userMessage)
          ) {
            console.log(
              "Evaluation request: fetching full product details."
            );

            const detailsResult = getProductDetails({
              productId: toolResult.productId,
            });

            console.log(
              "Evaluation product details:"
            );
            console.dir(detailsResult, { depth: null });

            if (!detailsResult.success) {
              return res.json({
                message:
                  detailsResult.error ||
                  "I couldn't retrieve enough product information to evaluate it.",
              });
            }


            evaluationProduct = detailsResult.product;

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                ...toolResult,
                instruction:
                  "Internal resolution result. Do not expose product IDs.",
              }),
            });

            messages.push({
              role: "user",
              content: `
The customer is asking whether this product is worth it.

Answer the customer's question using ONLY the merchant catalog facts
provided below.

Your answer MUST:
1. State the important facts from the catalog.
2. Give a cautious assessment based on those facts.
3. Clearly state when the catalog does not contain enough information
   to make a definitive value judgment.

Do NOT ask the customer for their budget, preferences, or requirements.
Answer the question with the information already available.

IMPORTANT:
A product specification is a FACT, not proof of performance.

For example:
- "It has 16GB RAM" is allowed.
- "It has a Ryzen 7 processor" is allowed.
- "It costs ₹55,000" is allowed.
- "It has a 4.5 rating" is allowed.

But these statements are NOT allowed unless the merchant catalog
explicitly supports them:
- "It is competitively priced."
- "It is high-performance."
- "It is top-tier."
- "It is reliable."
- "It is a good investment."
- "It is the best option."
- "It is the best value."
- "It provides good performance."
- "It will perform well."
- "It is suitable for most users."

Do NOT invent or infer:
- benchmark results
- battery life
- GPU performance
- build quality
- durability
- warranty
- competitor prices
- market prices
- competitor comparisons
- user experience
- missing features

Do not use the product's stock quantity to make recommendations about
availability or urgency.

If the catalog does not provide enough information to determine whether
₹55,000 is good value compared with alternatives, say that clearly.

Do not refuse to answer merely because comparison information is missing.
Give the useful assessment that can be made from the catalog facts first,
then explain the limitation.

Never expose:
- internal product IDs
- tool calls
- confidence scores
- resolution information
- internal system information

Merchant catalog information:

${JSON.stringify(detailsResult.product, null, 2)}
`,
            });

            continue;
          }

          toolContent = {
            ...toolResult,
            instruction:
              "This is an internal product resolution result. Do not show product IDs or internal matching information to the customer. Continue with the tool required by the customer's original request.",
          };

          // The customer explicitly asked to add the product.
          // We already resolved the real catalog product ID,
          // so execute the cart action directly.
          if (
            toolResult.success &&
            isExplicitCartAddRequest(userMessage)
          ) {
            console.log(
              "Original intent is ADD TO CART. Continuing with addToCart."
            );

            const addResult = addToCart({
              productId: toolResult.productId,
              quantity: requestedQuantity,
            });

            console.log("Forced addToCart result:");
            console.dir(addResult, { depth: null });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolContent),
            });

            if (addResult.success) {
              return res.json({
                message: `${toolResult.productName} has been added to your cart.`,
              });
            }

            return res.json({
              message:
                addResult.error ||
                `I couldn't add ${toolResult.productName} to your cart.`,
            });
          }
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