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

module.exports = {
  searchProducts,
};
