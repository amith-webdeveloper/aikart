const products = require("../data/products");
const cart = require("../data/cart");

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

module.exports = {
  searchProducts,
  getProductDetails,
  addToCart,
};




