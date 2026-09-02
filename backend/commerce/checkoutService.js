const products = require("../data/products");

function createCheckoutSnapshot(cart) {
    if (!Array.isArray(cart)) {
        throw new Error("Cart must be an array");
    }

    if (cart.length === 0) {
        throw new Error("Cannot create checkout from an empty cart");
    }

    const items = cart.map((cartItem) => {
        const product = products.find(
            (item) => item.id === cartItem.productId
        );

        if (!product) {
            throw new Error(
                `Product ${cartItem.productId} no longer exists`
            );
        }

        const quantity = Number(cartItem.quantity);

        if (
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {
            throw new Error(
                `Invalid quantity for ${product.name}`
            );
        }

        if (quantity > product.stock) {
            throw new Error(
                `Insufficient stock for ${product.name}`
            );
        }

        const unitPrice = product.price;
        const subtotal = unitPrice * quantity;

        return {
            productId: product.id,
            name: product.name,
            quantity,
            unitPrice,
            subtotal,
        };
    });

    const total = items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    return {
        status: "pending_confirmation",
        items,
        total,
    };
}

function confirmCheckout(checkout) {
    if (!checkout) {
        throw new Error("No checkout is awaiting confirmation");
    }

    if (checkout.status !== "pending_confirmation") {
        throw new Error("Checkout is no longer awaiting confirmation");
    }

    checkout.status = "confirmed";

    return checkout;
}

module.exports = {
    createCheckoutSnapshot,
    confirmCheckout,
};