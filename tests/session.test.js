const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getOrCreateSession,
    deleteSession,
    clearSessions,
} = require("../backend/state/sessionStore");

test("creates and retrieves the same session", () => {
    clearSessions();

    const first = getOrCreateSession("session-a");
    const second = getOrCreateSession("session-a");

    assert.strictEqual(first, second);
    assert.equal(first.sessionId, "session-a");
});

test("keeps different sessions isolated", () => {
    clearSessions();

    const sessionA = getOrCreateSession("session-a");
    const sessionB = getOrCreateSession("session-b");

    sessionA.selectedProductId = "lap001";

    assert.equal(
        sessionA.selectedProductId,
        "lap001"
    );

    assert.equal(
        sessionB.selectedProductId,
        null
    );
});

test("deletes a session", () => {
    clearSessions();

    getOrCreateSession("session-a");

    assert.equal(
        deleteSession("session-a"),
        true
    );

    const newSession =
        getOrCreateSession("session-a");

    assert.equal(
        newSession.selectedProductId,
        null
    );
});


test("cart can be isolated between sessions", () => {
    clearSessions();

    const sessionA = getOrCreateSession("session-a");
    const sessionB = getOrCreateSession("session-b");

    sessionA.cart = [];
    sessionB.cart = [];

    const {
        addToCart,
        getCart,
    } = require("../backend/tools/productTools");

    const addResult = addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: sessionA.cart,
    });

    assert.equal(addResult.success, true);

    const cartA = getCart(sessionA.cart);
    const cartB = getCart(sessionB.cart);

    assert.equal(cartA.length, 1);
    assert.equal(cartA[0].name, "ProBook X");
    assert.equal(cartA[0].quantity, 1);

    assert.equal(cartB.length, 0);
});

test("removing from one session does not affect another session", () => {
    clearSessions();

    const sessionA = getOrCreateSession("session-a");
    const sessionB = getOrCreateSession("session-b");

    sessionA.cart = [];
    sessionB.cart = [];

    const {
        addToCart,
        getCart,
        removeFromCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: sessionA.cart,
    });

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: sessionB.cart,
    });

    const removeResult = removeFromCart({
        productName: "ProBook X",
        cart: sessionA.cart,
    });

    assert.equal(removeResult.success, true);

    assert.equal(getCart(sessionA.cart).length, 0);

    assert.equal(getCart(sessionB.cart).length, 1);
    assert.equal(
        getCart(sessionB.cart)[0].name,
        "ProBook X"
    );
});


test("preserves conversation history within the same session", () => {
    clearSessions();

    const session = getOrCreateSession("conversation-a");

    session.messages.push({
        role: "user",
        content: "Tell me about ProBook X",
    });

    session.messages.push({
        role: "assistant",
        content: "ProBook X is a laptop with 16GB RAM and 512GB SSD.",
    });

    const sameSession =
        getOrCreateSession("conversation-a");

    assert.equal(
        sameSession.messages.length,
        2
    );

    assert.equal(
        sameSession.messages[0].role,
        "user"
    );

    assert.equal(
        sameSession.messages[0].content,
        "Tell me about ProBook X"
    );

    assert.equal(
        sameSession.messages[1].role,
        "assistant"
    );
});

test("conversation history is isolated between sessions", () => {
    clearSessions();

    const sessionA =
        getOrCreateSession("conversation-a");

    const sessionB =
        getOrCreateSession("conversation-b");

    sessionA.messages.push({
        role: "user",
        content: "Tell me about ProBook X",
    });

    sessionA.messages.push({
        role: "assistant",
        content: "ProBook X is a laptop.",
    });

    assert.equal(
        sessionA.messages.length,
        2
    );

    assert.equal(
        sessionB.messages.length,
        0
    );
});

test("new sessions start without an active checkout", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-a");

    assert.equal(
        session.checkout,
        null
    );
});

test("checkout state is isolated between sessions", () => {
    clearSessions();

    const sessionA =
        getOrCreateSession("checkout-a");

    const sessionB =
        getOrCreateSession("checkout-b");

    sessionA.checkout = {
        status: "pending_confirmation",
        total: 50000,
    };

    assert.equal(
        sessionA.checkout.status,
        "pending_confirmation"
    );

    assert.equal(
        sessionA.checkout.total,
        50000
    );

    assert.equal(
        sessionB.checkout,
        null
    );
});

test("deleting a session removes its checkout state", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-a");

    session.checkout = {
        status: "pending_confirmation",
        total: 50000,
    };

    assert.equal(
        deleteSession("checkout-a"),
        true
    );

    const newSession =
        getOrCreateSession("checkout-a");

    assert.equal(
        newSession.checkout,
        null
    );
});

test("creates a checkout snapshot from the session cart", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-snapshot-a");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    const {
        createCheckoutSnapshot,
    } = require("../backend/commerce/checkoutService");

    const checkout =
        createCheckoutSnapshot(
            session.cart,
            session.cartVersion
        );

    assert.equal(
        checkout.status,
        "pending_confirmation"
    );

    assert.equal(
        checkout.items.length,
        1
    );

    assert.equal(
        checkout.items[0].productId,
        "lap001"
    );

    assert.equal(
        checkout.items[0].name,
        "ProBook X"
    );

    assert.equal(
        checkout.items[0].quantity,
        1
    );

    assert.equal(
        checkout.items[0].unitPrice,
        55000
    );

    assert.equal(
        checkout.items[0].subtotal,
        55000
    );

    assert.equal(
        checkout.total,
        55000
    );

    assert.equal(
        checkout.cartVersion,
        session.cartVersion
    );
});


test("checkout snapshot calculates total from catalog prices", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-snapshot-b");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    addToCart({
        productName: "Wireless Mouse",
        quantity: 2,
        cart: session.cart,
    });

    const {
        createCheckoutSnapshot,
    } = require("../backend/commerce/checkoutService");

    const checkout =
        createCheckoutSnapshot(session.cart);

    assert.equal(
        checkout.items.length,
        2
    );

    assert.equal(
        checkout.total,
        56600
    );

    assert.equal(
        checkout.items[0].subtotal,
        55000
    );

    assert.equal(
        checkout.items[1].subtotal,
        1600
    );
});


test("cannot create checkout from an empty cart", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-empty");

    const {
        createCheckoutSnapshot,
    } = require("../backend/commerce/checkoutService");

    assert.throws(
        () => createCheckoutSnapshot(session.cart),
        /empty cart/i
    );
});


test("checkout snapshot rejects invalid cart quantity", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-invalid-quantity");

    session.cart.push({
        productId: "lap001",
        quantity: 0,
    });

    const {
        createCheckoutSnapshot,
    } = require("../backend/commerce/checkoutService");

    assert.throws(
        () => createCheckoutSnapshot(session.cart),
        /invalid quantity/i
    );
});


test("checkout snapshot rejects unknown products", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-unknown-product");

    session.cart.push({
        productId: "does-not-exist",
        quantity: 1,
    });

    const {
        createCheckoutSnapshot,
    } = require("../backend/commerce/checkoutService");

    assert.throws(
        () => createCheckoutSnapshot(session.cart),
        /no longer exists/i
    );
});

test("confirms a pending checkout", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-confirm-a");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    const {
        createCheckoutSnapshot,
        confirmCheckout,
    } = require("../backend/commerce/checkoutService");

    session.checkout =
        createCheckoutSnapshot(
            session.cart,
            session.cartVersion
        );

    const confirmedCheckout =
        confirmCheckout(
            session.checkout,
            session.cartVersion
        );
    session.checkout = confirmedCheckout;

    assert.equal(
        session.checkout.status,
        "confirmed"
    );
});


test("cannot confirm the same checkout twice", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-confirm-b");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    const {
        createCheckoutSnapshot,
        confirmCheckout,
    } = require("../backend/commerce/checkoutService");

    session.checkout =
        createCheckoutSnapshot(
            session.cart,
            session.cartVersion
        );

    confirmCheckout(
        session.checkout,
        session.cartVersion
    );

    assert.throws(
        () => confirmCheckout(session.checkout),
        /no longer awaiting confirmation/i
    );
});

test("allows pending checkout to transition to confirmed", () => {
    const checkout = {
        status: "pending_confirmation",
    };

    const {
        transitionCheckout,
    } = require("../backend/commerce/checkoutService");

    const result =
        transitionCheckout(
            checkout,
            "confirmed"
        );

    assert.equal(
        result.status,
        "confirmed"
    );
});

test("rejects invalid checkout state transitions", () => {
    const checkout = {
        status: "confirmed",
    };

    const {
        transitionCheckout,
    } = require("../backend/commerce/checkoutService");

    assert.throws(
        () =>
            transitionCheckout(
                checkout,
                "confirmed"
            ),
        /invalid checkout transition/i
    );

    assert.equal(
        checkout.status,
        "confirmed"
    );
});

test("rejects unsupported checkout state transitions", () => {
    const checkout = {
        status: "pending_confirmation",
    };

    const {
        transitionCheckout,
    } = require("../backend/commerce/checkoutService");

    assert.throws(
        () =>
            transitionCheckout(
                checkout,
                "paid"
            ),
        /invalid checkout transition/i
    );

    assert.equal(
        checkout.status,
        "pending_confirmation"
    );
});


test("cannot confirm a checkout after the cart changes", () => {
    clearSessions();

    const session =
        getOrCreateSession("stale-checkout-test");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    const {
        createCheckoutSnapshot,
        confirmCheckout,
    } = require("../backend/commerce/checkoutService");

    session.checkout =
        createCheckoutSnapshot(
            session.cart,
            session.cartVersion
        );

    addToCart({
        productName: "Wireless Mouse",
        quantity: 1,
        cart: session.cart,
    });

    session.cartVersion += 1;

    assert.throws(
        () =>
            confirmCheckout(
                session.checkout,
                session.cartVersion
            ),
        /stale.*cart.*changed/i
    );

    assert.equal(
        session.checkout.status,
        "pending_confirmation"
    );
});


test("cannot confirm when no checkout is awaiting confirmation", () => {
    clearSessions();

    const session =
        getOrCreateSession("checkout-confirm-c");

    const {
        confirmCheckout,
    } = require("../backend/commerce/checkoutService");

    assert.equal(
        session.checkout,
        null
    );

    assert.throws(
        () => confirmCheckout(session.checkout),
        /no checkout is awaiting confirmation/i
    );
});


test("checkout confirmation remains isolated between sessions", () => {
    clearSessions();

    const sessionA =
        getOrCreateSession("checkout-confirm-d-a");

    const sessionB =
        getOrCreateSession("checkout-confirm-d-b");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: sessionA.cart,
    });

    const {
        createCheckoutSnapshot,
        confirmCheckout,
    } = require("../backend/commerce/checkoutService");

    sessionA.checkout =
        createCheckoutSnapshot(
            sessionA.cart,
            sessionA.cartVersion
        );

    assert.equal(
        sessionA.checkout.status,
        "pending_confirmation"
    );

    assert.equal(
        sessionB.checkout,
        null
    );

    assert.throws(
        () => confirmCheckout(sessionB.checkout),
        /no checkout is awaiting confirmation/i
    );

    assert.equal(
        sessionA.checkout.status,
        "pending_confirmation"
    );
});
