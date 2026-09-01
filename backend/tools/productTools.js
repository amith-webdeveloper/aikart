const products = require("../data/products");
const defaultCart = require("../data/cart");
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

function getProductDetails({ productName, productId }) {
    let product;

    if (productId) {
        product = products.find(
            (product) => product.id === productId
        );
    } else if (productName) {
        const resolved = resolveProduct({
            productName,
        });

        if (!resolved.success) {
            return resolved;
        }

        product = products.find(
            (product) => product.id === resolved.productId
        );
    }

    if (!product) {
        return {
            success: false,
            error: "Product not found",
        };
    }

    return {
        success: true,
        product,
        knownInformation: Object.keys(product),
        instruction:
            "Only provide product facts that are present in this result. If the customer asks about an attribute that is not present, say that the information is not available in the merchant catalog. Never infer or guess missing attributes.",
    };
}

function getProductAttribute({
    productName,
    productId,
    attribute,
}) {
    let product;

    // Find product using ID
    if (productId) {
        product = products.find(
            (product) => product.id === productId
        );
    }

    // Find product using name
    else if (productName) {
        const resolved = resolveProduct({
            productName,
        });

        if (!resolved.success) {
            return resolved;
        }

        product = products.find(
            (product) => product.id === resolved.productId
        );
    }

    if (!product) {
        return {
            success: false,
            error: "Product not found",
        };
    }

    if (!attribute || typeof attribute !== "string") {
        return {
            success: false,
            error: "A valid product attribute is required",
        };
    }

    const normalizedAttribute = attribute
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "");

    // Check top-level product fields
    for (const [key, value] of Object.entries(product)) {
        const normalizedKey = key
            .toLowerCase()
            .replace(/\s+/g, "");

        if (normalizedKey === normalizedAttribute) {
            return {
                success: true,
                available: true,
                productName: product.name,
                attribute: key,
                value,
            };
        }
    }

    // Check flexible specifications
    if (product.specifications) {
        for (const [key, value] of Object.entries(
            product.specifications
        )) {
            const normalizedKey = key
                .toLowerCase()
                .replace(/\s+/g, "");

            if (normalizedKey === normalizedAttribute) {
                return {
                    success: true,
                    available: true,
                    productName: product.name,
                    attribute: key,
                    value,
                };
            }
        }
    }

    // Attribute does not exist
    return {
        success: true,
        available: false,
        productName: product.name,
        attribute,
        value: null,
        customerAnswer:
            `The merchant catalog does not provide information about ${attribute} for ${product.name}.`,
    };
}

function addToCart({
    productName,
    productId,
    quantity = 1,
    cart = defaultCart,
}) {
    let product;

    if (productId) {
        product = products.find(
            (product) => product.id === productId
        );
    } else if (productName) {
        const resolved = resolveProduct({
            productName,
        });

        if (!resolved.success) {
            return resolved;
        }

        product = products.find(
            (item) => item.id === resolved.productId
        );
    }
    if (!product) {
        return {
            success: false,
            error: "Product not found",
        };
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return {
            success: false,
            error: "Quantity must be a positive whole number",
        };
    }

    if (quantity > product.stock) {
        return {
            success: false,
            error: `Only ${product.stock} units are available`,
        };
    }

    const existingItem = cart.find(
        (item) => item.productId === product.id
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
            productId: product.id,
            quantity,
        });
    }

    return {
        success: true,
        message: `${product.name} added to cart`,
        item: {
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity:
                existingItem?.quantity || quantity,
        },
    };
}

function getCart(cart = defaultCart) {
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

function removeFromCart({
    productId,
    productName,
    cart = defaultCart,
}) {
    let resolvedProductId = productId;

    // If the AI provides a product name instead of an ID,
    // resolve the name using the merchant catalog.
    if (!resolvedProductId && productName) {
        const resolved = resolveProduct({ productName });

        if (!resolved.success) {
            return resolved;
        }

        resolvedProductId = resolved.productId;
    }

    if (!resolvedProductId) {
        return {
            success: false,
            error: "A product ID or product name is required",
        };
    }

    const itemIndex = cart.findIndex(
        (item) => item.productId === resolvedProductId
    );

    if (itemIndex === -1) {
        return {
            success: false,
            error: "Product is not in the cart",
        };
    }

    const removedItem = cart.splice(itemIndex, 1)[0];

    const product = products.find(
        (product) => product.id === resolvedProductId
    );

    return {
        success: true,
        message: `${product?.name || "Product"} removed from cart`,
        productId: resolvedProductId,
        removedItem,
    };
}

function resolveProduct({ productName }) {
    if (!productName || typeof productName !== "string") {
        return {
            success: false,
            error: "A valid product name is required",
        };
    }

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
            productId: exactMatch.id,
            productName: exactMatch.name,
            confidence: 1,
        };
    }

    const matches = products
        .map((product) => {
            const similarity = stringSimilarity.compareTwoStrings(
                normalizedInput,
                product.name.toLowerCase().trim()
            );

            return {
                product,
                confidence: similarity,
            };
        })
        .sort((a, b) => b.confidence - a.confidence);

    if (matches.length === 0) {
        return {
            success: false,
            error: "No products are available in the catalog",
        };
    }

    const bestMatch = matches[0];

    if (bestMatch.confidence < 0.6) {
        return {
            success: false,
            error: "No confident product match found",
        };
    }

    return {
        success: true,
        productId: bestMatch.product.id,
        productName: bestMatch.product.name,

    };
}


module.exports = {
    searchProducts,
    getProductDetails,
    getProductAttribute,
    addToCart,
    getCart,
    removeFromCart,
    resolveProduct,
};
