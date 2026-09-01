const express = require("express");
const cors = require("cors");
const products = require("./data/products");

const { searchProducts, getProductDetails, addToCart, getCart, removeFromCart, resolveProduct, getProductAttribute } = require("./tools/productTools");

const {
  getOrCreateSession,
  clearSessions,
} = require("./state/sessionStore");

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

function isExplicitCartRemoveRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  const message = userMessage.toLowerCase();

  /*
   * Explicit cart removal request.
   *
   * Examples:
   * "remove ProBook X from my cart"
   * "take ProBook X out of my cart"
   * "delete ProBook X from my basket"
   */
  return (
    /\b(remove|delete|take)\b.*\b(from|out of)\b.*\b(cart|basket)\b/i.test(
      message
    ) ||
    /\b(remove|delete)\b.*\b(cart|basket)\b/i.test(message)
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

function extractProductInfoRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return null;
  }

  const match = userMessage.match(
    /^\s*(?:tell me about|what do you know about|give me information about|information about)\s+(.+?)\s*[?.!]*\s*$/i
  );

  if (!match) {
    return null;
  }

  return match[1]
    .trim()
    .replace(/[?.!]+$/, "")
    .trim();
}

function isWorthItRequest(userMessage) {
  if (typeof userMessage !== "string") {
    return false;
  }

  return /\b(worth it|worth buying|good value|value for money|good buy)\b/i
    .test(userMessage);
}

function findProductForEvaluation(userMessage) {
  if (typeof userMessage !== "string") {
    return null;
  }

  const normalizedMessage = userMessage
    .toLowerCase()
    .trim();

  /*
   * First prefer an exact product-name mention.
   *
   * Example:
   * "Is ProBook X worth it?"
   */
  const exactMatch = products.find((product) => {
    const normalizedProductName = product.name
      .toLowerCase()
      .trim();

    return normalizedMessage.includes(
      normalizedProductName
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  /*
   * If the customer uses a shortened product name,
   * allow a catalog product whose name begins with
   * the supplied product term.
   *
   * Example:
   * "Is the ProBook worth it?"
   * → ProBook X
   */
  const words = normalizedMessage
    .replace(/[₹$]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const candidate = products.find((product) => {
    const productName =
      product.name.toLowerCase().trim();

    const productWords =
      productName.split(/\s+/);

    return productWords.some((productWord) => {
      if (productWord.length < 4) {
        return false;
      }

      return words.includes(productWord);
    });
  });

  return candidate || null;
}

function hasUnsupportedEvaluationClaim(responseText) {
  if (typeof responseText !== "string") {
    return true;
  }

  const forbiddenPatterns = [
    // Unsupported value / quality claims
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
    /\bpowerful configuration\b/i,
    /\bpowerful laptop\b/i,
    /\bpowerful computer\b/i,
    /\bpowerful specs\b/i,
    /\bpowerful specifications\b/i,
    /\bcapable laptop\b/i,
    /\bcapable device\b/i,
    /\bcapable computer\b/i,
    /\bcapable configuration\b/i,
    /\bwell[- ]rated\b/i,
    /\baverage range\b/i,
    /\bmedium[- ]to[- ]high[- ]end\b/i,

    // Unsupported suitability claims
    /\bsuitable for\b/i,
    /\bgood for most users\b/i,
    /\bideal for\b/i,
    /\bperfect for\b/i,
    /\bgreat for\b/i,

    // Unsupported user-preference / requirement reasoning
    /\bdepends on your (needs|requirements|preferences)\b/i,
    /\bdepends on (your|the customer's) budget\b/i,
    /\bdepends on your specific needs\b/i,
    /\bdepends on your specific preferences\b/i,
    /\bdepends on your use case\b/i,
    /\bcustomer preferences\b/i,
    /\bcustomer requirements\b/i,
    /\bbudget constraints\b/i,
    /\bspecific use cases?\b/i,
    /\bspecific uses cases?\b/i,
    /\buse cases?\b/i,

    // Unsupported comparative/value reasoning
    /\bwithin the normal range\b/i,
    /bnormal price range\b/i,
    /bcompetitive with other\b/i,
    /bbetter than other\b/i,
    /bworse than other\b/i,
    /bworthwhile purchase\b/i,
    /bsolid choice\b/i,
    /bsolid laptop\b/i,
    /bcapable and reliable\b/i,
    /bwell[- ]rounded\b/i,
    /breasonably priced\b/i,
    /bwithin the range of other\b/i,
    /bwithin the range of\b/i,
    /bsimilar specifications\b/i,

    // Unsupported positive evaluation
    /\bthese are good specifications\b/i,
    /bthese are good specs\b/i,
    /bthese specifications are good\b/i,
    /\bgood specifications\b/i,
    /\bgood specs\b/i,

    // Unsupported purchase advice
    /\bit is advisable to consider\b/i,
    /\badvisable to consider\b/i,
    /\byou should consider\b/i,
    /\byou may want to consider\b/i,
    /\bconsider your specific needs\b/i,
    /\bconsider your needs\b/i,
    /\bconsider your budget\b/i,

    // Unsupported suitability/performance
    /\bcomfortable for general use\b/i,
    /\bsuitable for very demanding tasks\b/i,
    /\bnot suitable for\b/i,
    /\bmay not be suitable for\b/i,
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

function hasCompleteSearchProductNames(responseText, searchResults) {
  if (
    typeof responseText !== "string" ||
    !Array.isArray(searchResults)
  ) {
    return true;
  }

  return searchResults.every((product) => {
    if (!product || typeof product.name !== "string") {
      return true;
    }

    return responseText.includes(product.name);
  });
}

function formatCartForCustomer(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return "Your cart is currently empty. Would you like to add any products?";
  }

  const lines = cartItems.map((item) => {
    const price = `₹${item.price.toLocaleString("en-IN")}`;
    const subtotal = `₹${item.subtotal.toLocaleString("en-IN")}`;

    return `- ${item.quantity} ${item.name} — ${price} each — Subtotal: ${subtotal}`;
  });

  const total = cartItems.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );

  return (
    `Your cart contains:\n\n` +
    lines.join("\n") +
    `\n\nTotal: ₹${total.toLocaleString("en-IN")}`
  );
}

function addConversationTurn(session, userMessage, assistantMessage) {
  session.messages.push({
    role: "user",
    content: userMessage,
  });

  session.messages.push({
    role: "assistant",
    content: assistantMessage,
  });
}


// --------------------------------------------------
// TEST-ONLY CART RESET
// --------------------------------------------------

app.post("/api/test/reset-cart", (req, res) => {
  if (process.env.NODE_ENV !== "test") {
    return res.status(404).json({
      error: "Not found",
    });
  }

  clearSessions();

  return res.json({
    success: true,
    message: "Test sessions reset successfully",
  });
});

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;

  const sessionId = req.body.sessionId;

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({
      error: "A valid sessionId is required",
    });
  }

  const session = getOrCreateSession(sessionId);

  if (isInternalInformationRequest(userMessage)) {
    console.log(
      "Blocked internal information request."
    );

    return res.json({
      message:
        "I can't provide internal product IDs, confidence scores, or other internal system information.",
    });
  }

  // --------------------------------------------------
  // DETERMINISTIC PRODUCT ATTRIBUTE LOOKUP
  // --------------------------------------------------
  //
  // Do not rely on Qwen to correctly format tool calls for
  // straightforward attribute questions. Resolve the product
  // and query the merchant catalog directly.
  //
  const attributeMatch = userMessage.match(
    /\b(?:what(?:'s| is)|tell me|give me|do you know|how much|how long)\b.*\b(battery life|battery|processor|ram|memory|storage|display|price|stock|rating|brand|touchscreen|gpu)\b.*\b(?:of|for|on)\b\s+(.+?)\??$/i
  );

  if (attributeMatch) {
    const requestedAttribute = attributeMatch[1]
      .toLowerCase()
      .trim();

    const requestedProductName = attributeMatch[2]
      .trim()
      .replace(/[?.!]+$/, "");

    const attributeAliases = {
      "battery life": "battery",
      battery: "battery",
      processor: "processor",
      ram: "ram",
      memory: "ram",
      storage: "storage",
      display: "display",
      price: "price",
      stock: "stock",
      rating: "rating",
      brand: "brand",
      touchscreen: "touchscreen",
      gpu: "gpu",
    };

    const attribute =
      attributeAliases[requestedAttribute];

    console.log(
      "Deterministic attribute request:",
      {
        productName: requestedProductName,
        attribute,
      }
    );

    const resolutionResult = resolveProduct({
      productName: requestedProductName,
    });

    console.log("Attribute resolution result:");
    console.dir(resolutionResult, { depth: null });

    if (!resolutionResult.success) {
      return res.json({
        message:
          resolutionResult.error ||
          `I couldn't find ${requestedProductName} in the merchant catalog.`,
      });
    }

    const attributeResult = getProductAttribute({
      productId: resolutionResult.productId,
      attribute,
    });

    console.log("Attribute lookup result:");
    console.dir(attributeResult, { depth: null });

    if (!attributeResult.available) {
      const answer =
        attributeResult.customerAnswer ||
        "That information is not available in the merchant catalog.";

      addConversationTurn(
        session,
        userMessage,
        answer
      );

      return res.json({
        message: answer,
      });
    }

    const answer = attributeResult.customerAnswer;

    addConversationTurn(
      session,
      userMessage,
      answer
    );

    return res.json({
      message: answer,
    });
  }

  // --------------------------------------------------
  // DETERMINISTIC PRODUCT INFORMATION LOOKUP
  // --------------------------------------------------
  //
  // When the customer asks about one specific product,
  // resolve that product against the merchant catalog before
  // allowing the LLM to choose a different interpretation.
  //
  const productInfoName =
    extractProductInfoRequest(userMessage);

  if (productInfoName) {
    console.log(
      "Deterministic product information request:",
      productInfoName
    );

    const resolutionResult = resolveProduct({
      productName: productInfoName,
    });

    console.log("Product information resolution:");
    console.dir(resolutionResult, { depth: null });

    if (!resolutionResult.success) {
      return res.json({
        message:
          `I couldn't find "${productInfoName}" in the merchant catalog.`,
      });
    }

    const detailsResult = getProductDetails({
      productId: resolutionResult.productId,
    });

    console.log("Product information details:");
    console.dir(detailsResult, { depth: null });

    if (!detailsResult.success || !detailsResult.product) {
      return res.json({
        message:
          "I couldn't retrieve the product information from the merchant catalog.",
      });
    }

    const product = detailsResult.product;

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
      typeof product.stock === "number"
        ? `There are ${product.stock} units in stock.`
        : null,
    ].filter(Boolean);

    const answer = facts.join(" ");

    addConversationTurn(
      session,
      userMessage,
      answer
    );

    return res.json({
      message: answer,
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
    ...session.messages,
    {
      role: "user",
      content: userMessage,
    },
  ];

  try {
    let resolvedProductId = null;
    let resolvedProductName = null;
    let evaluationProduct = null;

    // Stores the latest merchant search result so the backend
    // can verify that the final AI response faithfully represents
    // the catalog products returned by searchProducts.
    let latestSearchResults = null;

    // --------------------------------------------------
    // DETERMINISTIC WORTH-IT EVALUATION
    // --------------------------------------------------

    if (isWorthItRequest(userMessage)) {
      console.log(
        "Deterministic product evaluation request detected."
      );

      const product =
        findProductForEvaluation(userMessage);

      if (product) {
        console.log(
          "Deterministically identified evaluation product:",
          {
            name: product.name,
          }
        );

        const detailsResult =
          getProductDetails({
            productId: product.id,
          });

        if (
          !detailsResult.success ||
          !detailsResult.product
        ) {
          return res.json({
            message:
              "I couldn't retrieve enough product information from the merchant catalog to evaluate it.",
          });
        }

        evaluationProduct =
          detailsResult.product;

        resolvedProductId =
          detailsResult.product.id;

        resolvedProductName =
          detailsResult.product.name;

        messages.push({
          role: "user",
          content: `
The customer is asking whether this product is worth it.

Answer the customer's question using ONLY the merchant catalog facts
provided below.

Your answer MUST:
1. State the important facts from the catalog.
2. Give a cautious assessment based only on those facts.
3. Clearly state when the catalog does not contain enough information
   to make a definitive value judgment.
4. Do NOT ask the customer for their budget, preferences, or requirements.

A product specification is a FACT, not proof of performance.

Allowed examples:
- "It has 16GB RAM."
- "It has an AMD Ryzen 7 processor."
- "It costs ₹55,000."
- "It has a 4.5 catalog rating."

Do NOT claim:
- competitive pricing
- market value
- high performance
- reliability
- durability
- best value
- best option
- suitability for specific workloads
- benchmark results
- battery life
- GPU performance
- competitor comparisons
- market prices
- warranty information
- features not present in the catalog

Never expose:
- product IDs
- confidence scores
- internal tool information
- internal system information

Merchant catalog information:

${JSON.stringify(
            detailsResult.product,
            null,
            2
          )}
`,
        });

        // Skip the normal tool-selection phase.
        // Qwen is now only responsible for producing
        // the customer-facing explanation.
      }
    }
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

        // --------------------------------------------------
        // SEARCH RESULT COMPLETENESS VALIDATION
        // --------------------------------------------------
        //
        // The AI must preserve the exact merchant product names
        // returned by searchProducts. It must not replace a
        // product name with its description or paraphrase it.
        //
        // Example:
        // Catalog: "FastSSD 1TB"
        // Invalid AI response: "1TB NVMe SSD"
        //
        if (
          latestSearchResults &&
          latestSearchResults.length > 0 &&
          !hasCompleteSearchProductNames(
            finalAnswer,
            latestSearchResults
          )
        ) {
          console.log(
            "Blocked incomplete search response."
          );

          console.log(
            "Rejected search response:",
            finalAnswer
          );

          const catalogLines = latestSearchResults.map(
            (product) => {
              const price =
                typeof product.price === "number"
                  ? `₹${product.price.toLocaleString("en-IN")}`
                  : "Price unavailable";

              return `- ${product.name}: ${price}`;
            }
          );

          return res.json({
            message:
              `Here are the products from the merchant catalog:\n\n` +
              catalogLines.join("\n"),
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

        addConversationTurn(
          session,
          userMessage,
          finalAnswer
        );

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

          // Preserve the exact merchant catalog results.
          // The final AI response must not rename or omit products.
          latestSearchResults = Array.isArray(toolResult)
            ? toolResult
            : null;

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
              cart: session.cart,
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

              toolResult = addToCart({
                ...safeArguments,
                cart: session.cart,
              });
            }
          }
        } else if (toolName === "getCart") {
          toolResult = getCart(session.cart);

          const answer = formatCartForCustomer(toolResult);

          addConversationTurn(
            session,
            userMessage,
            answer
          );

          return res.json({
            message: answer,
          });

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

          toolResult = removeFromCart({
            ...safeRemoveArguments,
            cart: session.cart,
          });


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

        // Give tool result back to Qwen.
        // Never expose merchant-internal product IDs to the model
        // when they are not required to complete the customer's request.
        let toolContent = toolResult;

        if (toolName === "getCart" && Array.isArray(toolResult)) {
          toolContent = toolResult.map((item) => {
            const { productId, ...customerSafeItem } = item;

            return customerSafeItem;
          });
        }

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
              cart: session.cart,
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

          // The customer explicitly asked to remove the product.
          // The product has already been resolved to a trusted catalog ID.
          // Execute the removal directly instead of asking the LLM
          // to decide what to do next.
          if (
            toolResult.success &&
            isExplicitCartRemoveRequest(userMessage)
          ) {
            console.log(
              "Original intent is REMOVE FROM CART. Continuing with removeFromCart."
            );

            const removeResult = removeFromCart({
              productId: toolResult.productId,
              cart: session.cart,
            });

            console.log("Forced removeFromCart result:");
            console.dir(removeResult, { depth: null });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolContent),
            });

            if (removeResult.success) {
              return res.json({
                message:
                  `${toolResult.productName} has been removed from your cart.`,
              });
            }

            return res.json({
              message:
                removeResult.error ||
                `I couldn't remove ${toolResult.productName} from your cart.`,
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