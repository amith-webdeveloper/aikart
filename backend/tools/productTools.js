const products = require("../data/products");

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

module.exports = {
  searchProducts,
  getProductDetails
};

