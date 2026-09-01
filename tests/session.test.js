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

