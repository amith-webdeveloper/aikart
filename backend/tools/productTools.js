const products = require("../data/products");
const cart = require("../data/cart");
const stringSimilarity = require("string-similarity");

function searchProducts({ category, maxPrice }) {
  const results = products.filter((product) => {
    const categoryMatches =
      !category || product.category === category;

    const priceMatches =
      !maxPrice || product.price <= maxPrice;

    return categoryMatches && priceMatches;
  });

  return results;
}

function getProductDetails({ productId }) {
  const product = products.find(
    (product) => product.id === productId
  );

  if (!product) {
    return {
      error: "Product not found",
    };
  }

  return product;
}

function addToCart({ productId, quantity = 1 }) {
  const product = products.find(
    (product) => product.id === productId
  );

  if (!product) {
    return {
      success: false,
      error: "Product not found",
    };
  }

  if (quantity <= 0) {
    return {
      success: false,
      error: "Quantity must be at least 1",
    };
  }

  if (quantity > product.stock) {
    return {
      success: false,
      error: `Only ${product.stock} units are available`,
    };
  }

  const existingItem = cart.find(
    (item) => item.productId === productId
  );

  if (existingItem) {
    if (existingItem.quantity + quantity > product.stock) {
      return {
        success: false,
        error: `Only ${product.stock} units are available`,
      };
    }

    existingItem.quantity += quantity;
  } else {
    cart.push({
      productId,
      quantity,
    });
  }

  return {
    success: true,
    message: `${product.name} added to cart`,
    item: {
      productId,
      name: product.name,
      price: product.price,
      quantity:
        existingItem?.quantity || quantity,
    },
  };
}

function getCart() {
  return cart.map((item) => {
    const product = products.find(
      (product) => product.id === item.productId
    );

    return {
      productId: item.productId,
      name: product?.name || "Unknown product",
      price: product?.price || 0,
      quantity: item.quantity,
      subtotal: (product?.price || 0) * item.quantity,
    };
  });
}

function removeFromCart({ productId }) {
  const itemIndex = cart.findIndex(
    (item) => item.productId === productId
  );

  if (itemIndex === -1) {
    return {
      success: false,
      error: "Product is not in the cart",
    };
  }

  const removedItem = cart.splice(itemIndex, 1)[0];

  const product = products.find(
    (product) => product.id === productId
  );

  return {
    success: true,
    message: `${product?.name || "Product"} removed from cart`,
    productId,
  };
}

function resolveProduct(productName) {
  const normalizedInput = productName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  const exactMatch = products.find(
    (product) =>
      product.name.toLowerCase().trim() === normalizedInput
  );

  if (exactMatch) {
    return {
      success: true,
      product: exactMatch,
      confidence: 1,
    };
  }

  const matches = products.map((product) => {
    const similarity = stringSimilarity.compareTwoStrings(
      normalizedInput,
      product.name.toLowerCase()
    );

    return {
      product,
      confidence: similarity,
    };
  });

  matches.sort(
    (a, b) => b.confidence - a.confidence
  );

  const bestMatch = matches[0];

  if (!bestMatch || bestMatch.confidence < 0.6) {
    return {
      success: false,
      error: "No confident product match found",
    };
  }

  return {
    success: true,
    product: bestMatch.product,
    confidence: bestMatch.confidence,
  };
}


module.exports = {
  searchProducts,
  getProductDetails,
  addToCart,
  getCart,
  removeFromCart,
  resolveProduct,
};



console.log(
  resolveProduct("ProBook X")
);