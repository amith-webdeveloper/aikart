const products = require("../data/products");

function createCheckoutSnapshot(cart, cartVersion) {
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
        cartVersion,
    };
}

function transitionCheckout(checkout, nextStatus) {
    if (!checkout) {
        throw new Error("Checkout does not exist");
    }

    if (
        checkout.status === "pending_confirmation" &&
        nextStatus === "confirmed"
    ) {
        checkout.status = nextStatus;
        return checkout;
    }

    throw new Error(
        `Invalid checkout transition: ${checkout.status} -> ${nextStatus}`
    );
}

function confirmCheckout(checkout, currentCartVersion) {
    if (!checkout) {
        throw new Error("No checkout is awaiting confirmation");
    }

    if (checkout.status !== "pending_confirmation") {
        throw new Error("Checkout is no longer awaiting confirmation");
    }

    if (checkout.cartVersion !== currentCartVersion) {
        throw new Error("Checkout is stale because the cart has changed");
    }

    return transitionCheckout(
        checkout,
        "confirmed"
    );
}

module.exports = {
    createCheckoutSnapshot,
    confirmCheckout,
    transitionCheckout,
};
