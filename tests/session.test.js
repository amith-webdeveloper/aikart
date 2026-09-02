const http = require("http");
const app = require("../backend/server");

function startTestServer() {
    return new Promise((resolve) => {
        const server = http.createServer(app);

        server.listen(0, () => {
            const { port } = server.address();

            resolve({
                server,
                baseUrl: `http://127.0.0.1:${port}`,
            });
        });
    });
}


const {
    recordAuditEvent,
} = require("../backend/state/auditLog");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getOrCreateSession,
    getSession,
    deleteSession,
    clearSessions,
} = require("../backend/state/sessionStore");

const {
    createPaymentState,
    transitionPayment,
    verifyPaymentForSession
} = require("../backend/payments/paymentService");

const {
    verifyRazorpayPayment,
    razorpay,
} = require("../backend/payments/razorpayService");


test("audit events are recorded with type and timestamp", () => {
    const session = getOrCreateSession(
        "audit-log-basic"
    );

    const event = recordAuditEvent(
        session,
        "checkout.created"
    );

    assert.equal(
        event.type,
        "checkout.created"
    );

    assert.equal(
        typeof event.timestamp,
        "string"
    );

    assert.equal(
        session.auditLog.length,
        1
    );

    assert.deepEqual(
        session.auditLog[0],
        event
    );
});

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

test("new sessions start without an active payment", () => {
    clearSessions();

    const session =
        getOrCreateSession("payment-a");

    assert.equal(
        session.payment,
        null
    );
});

test("payment state is isolated between sessions", () => {
    clearSessions();

    const sessionA =
        getOrCreateSession("payment-a");

    const sessionB =
        getOrCreateSession("payment-b");

    sessionA.payment = {
        status: "created",
        razorpayOrderId: "order_test_123",
        amount: 10000,
    };

    assert.equal(
        sessionA.payment.status,
        "created"
    );

    assert.equal(
        sessionA.payment.razorpayOrderId,
        "order_test_123"
    );

    assert.equal(
        sessionB.payment,
        null
    );
});

test("payment state is created from a Razorpay order", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    assert.deepEqual(
        payment,
        {
            status: "created",
            razorpayOrderId: "order_test_123",
            amount: 10000,
        }
    );
});

test("payment state rejects an invalid Razorpay order", () => {
    assert.throws(
        () => createPaymentState({
            id: "order_test_123",
            amount: 0,
        }),
        /Invalid payment amount/
    );
});

test("payment can transition from created to paid", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const result = transitionPayment(
        payment,
        "paid"
    );

    assert.equal(result.status, "paid");
});

test("payment can transition from created to failed", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const result = transitionPayment(
        payment,
        "failed"
    );

    assert.equal(result.status, "failed");
});

test("marks the session payment as failed", () => {
    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const {
        failPaymentForSession,
    } = require("../backend/payments/paymentService");

    const result = failPaymentForSession(session);

    assert.equal(result.status, "failed");
    assert.equal(session.payment.status, "failed");
});

test("payment can transition from created to cancelled", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const result = transitionPayment(
        payment,
        "cancelled"
    );

    assert.equal(result.status, "cancelled");
});

test("paid payment cannot transition again", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    transitionPayment(payment, "paid");

    assert.throws(
        () => transitionPayment(payment, "failed"),
        /Invalid payment transition/
    );
});

test("failed payment cannot transition again", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    transitionPayment(payment, "failed");

    assert.throws(
        () => transitionPayment(payment, "paid"),
        /Invalid payment transition/
    );
});

test("cancelled payment cannot transition again", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    transitionPayment(payment, "cancelled");

    assert.throws(
        () => transitionPayment(payment, "paid"),
        /Invalid payment transition/
    );
});

test("failed payment cannot be cancelled", () => {
    const payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    transitionPayment(payment, "failed");

    assert.throws(
        () => transitionPayment(payment, "cancelled"),
        /Invalid payment transition/
    );
});

test("valid Razorpay payment signature is accepted", () => {
    const orderId = "order_test_123";
    const paymentId = "pay_test_123";

    const crypto = require("crypto");

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    const result = verifyRazorpayPayment(
        orderId,
        paymentId,
        signature
    );

    assert.equal(result, true);
});

test("invalid Razorpay payment signature is rejected", () => {
    const result = verifyRazorpayPayment(
        "order_test_123",
        "pay_test_123",
        "forged_signature"
    );

    assert.equal(result, false);
});

test("payment verification rejects invalid input", () => {
    assert.throws(
        () => verifyRazorpayPayment(
            null,
            "pay_test_123",
            "signature"
        ),
        /Invalid payment verification data/
    );
});

test("payment cannot transition to paid unless it is created", () => {
    const payment = {
        status: "failed",
        razorpayOrderId: "order_test_123",
        amount: 10000,
    };

    assert.throws(
        () => transitionPayment(payment, "paid"),
        /Invalid payment transition/
    );
});

test("valid payment verification marks session payment as paid", async () => {
    const crypto = require("crypto");

    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const paymentId = "pay_test_123";

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`order_test_123|${paymentId}`)
        .digest("hex");

    razorpay.payments.fetch = async () => ({
        id: paymentId,
        order_id: "order_test_123",
        amount: 10000,
        status: "captured",
    });

    const result = await verifyPaymentForSession(
        session,
        paymentId,
        signature
    );

    assert.equal(result.status, "paid");
    assert.equal(session.payment.status, "paid");
});

test("payment verification rejects a payment belonging to a different order", async () => {
    const crypto = require("crypto");

    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const paymentId = "pay_test_123";

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`order_test_123|${paymentId}`)
        .digest("hex");

    razorpay.payments.fetch = async () => ({
        id: paymentId,
        order_id: "order_attacker",
        amount: 10000,
        status: "captured",
    });

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                paymentId,
                signature
            ),
        /does not belong to this order/
    );

    assert.equal(
        session.payment.status,
        "created"
    );
});

test("payment verification rejects a payment with a different amount", async () => {
    const crypto = require("crypto");

    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const paymentId = "pay_test_123";

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`order_test_123|${paymentId}`)
        .digest("hex");

    razorpay.payments.fetch = async () => ({
        id: paymentId,
        order_id: "order_test_123",
        amount: 100,
        status: "captured",
    });

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                paymentId,
                signature
            ),
        /amount does not match the order/
    );

    assert.equal(
        session.payment.status,
        "created"
    );
});

test("payment verification rejects a payment that is not captured", async () => {
    const crypto = require("crypto");

    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const paymentId = "pay_test_123";

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`order_test_123|${paymentId}`)
        .digest("hex");

    razorpay.payments.fetch = async () => ({
        id: paymentId,
        order_id: "order_test_123",
        amount: 10000,
        status: "authorized",
    });

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                paymentId,
                signature
            ),
        /Payment has not been captured/
    );

    assert.equal(
        session.payment.status,
        "created"
    );
});

test("payment verification does not mark payment as paid when Razorpay fetch fails", async () => {
    const crypto = require("crypto");

    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    const paymentId = "pay_test_123";

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(`order_test_123|${paymentId}`)
        .digest("hex");

    razorpay.payments.fetch = async () => {
        throw new Error("Razorpay API unavailable");
    };

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                paymentId,
                signature
            ),
        /Razorpay API unavailable/
    );

    assert.equal(
        session.payment.status,
        "created"
    );
});

test("invalid payment verification does not mark payment as paid", async () => {
    const session = {
        payment: createPaymentState({
            id: "order_test_123",
            amount: 10000,
        }),
    };

    await assert.rejects(
        () => verifyPaymentForSession(
            session,
            "pay_test_123",
            "forged_signature"
        ),
        /Invalid payment signature/
    );

    assert.equal(
        session.payment.status,
        "created"
    );
});

test("failed payment cannot be verified as paid", async () => {
    const session = {
        payment: {
            status: "failed",
            razorpayOrderId: "order_test_123",
            amount: 10000,
        },
    };

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                "pay_test_123",
                "signature"
            ),
        /no longer awaiting verification/i
    );

    assert.equal(
        session.payment.status,
        "failed"
    );
});

test("cancelled payment cannot be verified as paid", async () => {
    const session = {
        payment: {
            status: "cancelled",
            razorpayOrderId: "order_test_123",
            amount: 10000,
        },
    };

    await assert.rejects(
        () =>
            verifyPaymentForSession(
                session,
                "pay_test_123",
                "signature"
            ),
        /no longer awaiting verification/i
    );

    assert.equal(
        session.payment.status,
        "cancelled"
    );
});

test("payment verification rejects a session without an active payment", async () => {
    const session = {
        payment: null,
    };

    await assert.rejects(
        () => verifyPaymentForSession(
            session,
            "pay_test_123",
            "signature"
        ),
        /No active payment/
    );
});

test("gets an existing session without creating one", () => {
    clearSessions();

    const createdSession =
        getOrCreateSession("lookup-a");

    const foundSession =
        getSession("lookup-a");

    assert.equal(
        foundSession,
        createdSession
    );
});

test("returns null for an unknown session", () => {
    clearSessions();

    const session =
        getSession("does-not-exist");

    assert.equal(
        session,
        null
    );
});

test("payment creation rejects an unknown session", async () => {
    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "unknown-create-payment-session",
                }),
            }
        );

        assert.equal(response.status, 404);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error: "Session not found",
            }
        );
    } finally {
        server.close();
    }
});

test("payment creation rejects an unconfirmed checkout", async () => {
    const session = getOrCreateSession(
        "payment-create-unconfirmed"
    );

    session.checkout = {
        status: "pending_confirmation",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-create-unconfirmed",
                }),
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error:
                    "Checkout must be confirmed before payment",
            }
        );

        assert.equal(
            session.payment,
            null
        );
    } finally {
        server.close();
    }
});

test("payment creation creates a Razorpay order for a confirmed checkout", async () => {
    const session = getOrCreateSession(
        "payment-create-confirmed"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    const originalCreate =
        razorpay.orders.create;

    razorpay.orders.create = async (options) => {
        assert.deepEqual(
            options,
            {
                amount: 10000,
                currency: "INR",
            }
        );

        return {
            id: "order_test_create_123",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-create-confirmed",
                }),
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.equal(
            body.success,
            true
        );

        assert.deepEqual(
            body.payment,
            {
                status: "created",
                razorpayOrderId: "order_test_create_123",
                amount: 10000,
            }
        );

        assert.deepEqual(
            session.payment,
            body.payment
        );
    } finally {
        server.close();
        razorpay.orders.create =
            originalCreate;
    }
});

test("payment creation returns the existing payment for a duplicate request", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-idempotency-created"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    session.payment = {
        status: "created",
        razorpayOrderId: "order_existing_123",
        amount: 10000,
    };

    const originalCreate =
        razorpay.orders.create;

    let orderCreationAttempted = false;

    razorpay.orders.create = async () => {
        orderCreationAttempted = true;

        return {
            id: "order_should_not_exist",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId:
                        "payment-idempotency-created",
                }),
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                success: true,
                payment: {
                    status: "created",
                    razorpayOrderId:
                        "order_existing_123",
                    amount: 10000,
                },
            }
        );

        assert.equal(
            orderCreationAttempted,
            false
        );

        assert.deepEqual(
            session.payment,
            {
                status: "created",
                razorpayOrderId:
                    "order_existing_123",
                amount: 10000,
            }
        );
    } finally {
        server.close();

        razorpay.orders.create =
            originalCreate;
    }
});

test("repeated payment creation requests reuse the same payment", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-idempotency-sequence"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    const originalCreate =
        razorpay.orders.create;

    let orderCreationCount = 0;

    razorpay.orders.create = async () => {
        orderCreationCount += 1;

        return {
            id: "order_idempotent_123",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const request = () =>
            fetch(
                `${baseUrl}/api/payment/create`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        sessionId:
                            "payment-idempotency-sequence",
                    }),
                }
            );

        const firstResponse = await request();

        assert.equal(
            firstResponse.status,
            200
        );

        const firstBody =
            await firstResponse.json();

        const secondResponse = await request();

        assert.equal(
            secondResponse.status,
            200
        );

        const secondBody =
            await secondResponse.json();

        assert.deepEqual(
            secondBody.payment,
            firstBody.payment
        );

        assert.equal(
            orderCreationCount,
            1
        );

        assert.deepEqual(
            session.payment,
            firstBody.payment
        );
    } finally {
        server.close();

        razorpay.orders.create =
            originalCreate;
    }
});

test("payment creation rejects an already paid payment", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-create-paid"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    session.payment = {
        status: "paid",
        razorpayOrderId: "order_paid_123",
        amount: 10000,
    };

    const originalCreate =
        razorpay.orders.create;

    let orderCreationAttempted = false;

    razorpay.orders.create = async () => {
        orderCreationAttempted = true;

        return {
            id: "order_should_not_exist",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-create-paid",
                }),
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error: "Payment has already been completed",
            }
        );

        assert.equal(
            orderCreationAttempted,
            false
        );

        assert.deepEqual(
            session.payment,
            {
                status: "paid",
                razorpayOrderId: "order_paid_123",
                amount: 10000,
            }
        );
    } finally {
        server.close();

        razorpay.orders.create =
            originalCreate;
    }
});

test("payment creation creates a new payment after a failed payment", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-retry-failed"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    session.payment = {
        status: "failed",
        razorpayOrderId: "order_failed_123",
        amount: 10000,
    };

    const originalCreate =
        razorpay.orders.create;

    razorpay.orders.create = async (options) => {
        assert.deepEqual(
            options,
            {
                amount: 10000,
                currency: "INR",
            }
        );

        return {
            id: "order_retry_123",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-retry-failed",
                }),
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                success: true,
                payment: {
                    status: "created",
                    razorpayOrderId: "order_retry_123",
                    amount: 10000,
                },
            }
        );

        assert.deepEqual(
            session.payment,
            {
                status: "created",
                razorpayOrderId: "order_retry_123",
                amount: 10000,
            }
        );
    } finally {
        server.close();
        razorpay.orders.create =
            originalCreate;
    }
});

test("payment creation creates a new payment after a cancelled payment", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-retry-cancelled"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    session.payment = {
        status: "cancelled",
        razorpayOrderId: "order_cancelled_123",
        amount: 10000,
    };

    const originalCreate =
        razorpay.orders.create;

    razorpay.orders.create = async (options) => {
        assert.deepEqual(
            options,
            {
                amount: 10000,
                currency: "INR",
            }
        );

        return {
            id: "order_retry_cancelled_123",
            amount: 10000,
            currency: "INR",
            status: "created",
        };
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-retry-cancelled",
                }),
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                success: true,
                payment: {
                    status: "created",
                    razorpayOrderId: "order_retry_cancelled_123",
                    amount: 10000,
                },
            }
        );

        assert.deepEqual(
            session.payment,
            {
                status: "created",
                razorpayOrderId: "order_retry_cancelled_123",
                amount: 10000,
            }
        );
    } finally {
        server.close();
        razorpay.orders.create =
            originalCreate;
    }
});

test("payment creation does not store payment state when Razorpay order creation fails", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-create-razorpay-failure"
    );

    session.checkout = {
        status: "confirmed",
        items: [
            {
                productId: "prod_1",
                name: "Test Product",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
            },
        ],
        total: 100,
        cartVersion: 0,
    };

    const originalCreate =
        razorpay.orders.create;

    razorpay.orders.create = async () => {
        throw new Error(
            "Razorpay order creation failed"
        );
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId:
                        "payment-create-razorpay-failure",
                }),
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error:
                    "Razorpay order creation failed",
            }
        );

        assert.equal(
            session.payment,
            null
        );
    } finally {
        server.close();
        razorpay.orders.create =
            originalCreate;
    }
});

test("payment cancellation marks the active payment as cancelled", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-cancel"
    );

    session.payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/cancel`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-cancel",
                }),
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                success: true,
                payment: {
                    status: "cancelled",
                    razorpayOrderId: "order_test_123",
                    amount: 10000,
                },
            }
        );

        assert.equal(
            session.payment.status,
            "cancelled"
        );
    } finally {
        server.close();
    }
});

test("payment cancellation rejects a payment that is already paid", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-cancel-paid"
    );

    session.payment = {
        status: "paid",
        razorpayOrderId: "order_test_123",
        amount: 10000,
    };

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/cancel`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-cancel-paid",
                }),
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error:
                    "Invalid payment transition: paid -> cancelled",
            }
        );

        assert.equal(
            session.payment.status,
            "paid"
        );
    } finally {
        server.close();
    }
});

test("payment cancellation rejects a session without an active payment", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-cancel-none"
    );

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/cancel`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-cancel-none",
                }),
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json();

        assert.deepEqual(
            body,
            {
                error: "No active payment",
            }
        );

        assert.equal(
            session.payment,
            null
        );
    } finally {
        server.close();
    }
});

test("payment verification rejects an unknown session", async () => {
    clearSessions();

    const { server, baseUrl } =
        await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/verify`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "unknown-payment-session",
                    razorpayPaymentId: "pay_test_123",
                    razorpaySignature: "signature",
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 404);
        assert.equal(
            body.error,
            "Session not found"
        );
    } finally {
        server.close();
    }
});

test("payment verification marks a valid payment as paid through the API", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-valid"
    );

    session.payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const paymentId = "pay_test_123";

    const crypto = require("crypto");

    const signature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(
            `order_test_123|${paymentId}`
        )
        .digest("hex");

    razorpay.payments.fetch = async () => ({
        id: paymentId,
        order_id: "order_test_123",
        amount: 10000,
        status: "captured",
    });

    const { server, baseUrl } =
        await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/verify`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-valid",
                    razorpayPaymentId: paymentId,
                    razorpaySignature: signature,
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.payment.status, "paid");
        assert.equal(
            body.payment.razorpayOrderId,
            "order_test_123"
        );
        assert.equal(
            session.payment.status,
            "paid"
        );
    } finally {
        server.close();
    }
});

test("payment verification rejects a forged signature through the API", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-forged"
    );

    session.payment = createPaymentState({
        id: "order_test_123",
        amount: 10000,
    });

    const { server, baseUrl } =
        await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/verify`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-forged",
                    razorpayPaymentId: "pay_test_123",
                    razorpaySignature: "this_is_forged",
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(
            body.error,
            "Invalid payment signature"
        );

        assert.equal(
            session.payment.status,
            "created"
        );
    } finally {
        server.close();
    }
});

test("payment verification rejects missing payment data through the API", async () => {
    clearSessions();

    const { server, baseUrl } =
        await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/verify`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-invalid",
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(
            body.error,
            "Invalid payment verification data"
        );
    } finally {
        server.close();
    }
});

test("payment verification rejects a signature generated for a different order", async () => {
    clearSessions();

    const session = getOrCreateSession(
        "payment-http-wrong-order"
    );

    session.payment = createPaymentState({
        id: "order_expected",
        amount: 10000,
    });

    const paymentId = "pay_test_123";

    const crypto = require("crypto");

    const wrongOrderSignature = crypto
        .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
        )
        .update(
            `order_attacker|${paymentId}`
        )
        .digest("hex");

    const { server, baseUrl } =
        await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/payment/verify`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId: "payment-http-wrong-order",
                    razorpayPaymentId: paymentId,
                    razorpaySignature: wrongOrderSignature,
                }),
            }
        );

        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(
            body.error,
            "Invalid payment signature"
        );

        assert.equal(
            session.payment.razorpayOrderId,
            "order_expected"
        );

        assert.equal(
            session.payment.status,
            "created"
        );
    } finally {
        server.close();
    }
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

test("checkout request records a checkout.created audit event", async () => {
    clearSessions();

    const session =
        getOrCreateSession("audit-checkout-created");

    const {
        addToCart,
    } = require("../backend/tools/productTools");

    addToCart({
        productName: "ProBook X",
        quantity: 1,
        cart: session.cart,
    });

    const {
        server,
        baseUrl,
    } = await startTestServer();

    try {
        const response = await fetch(
            `${baseUrl}/api/chat`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId:
                        "audit-checkout-created",
                    message:
                        "proceed to checkout",
                }),
            }
        );

        assert.equal(
            response.status,
            200
        );

        const body =
            await response.json();

        assert.match(
            body.message,
            /checkout total is/i
        );

        assert.equal(
            session.auditLog.length,
            1
        );

        assert.deepEqual(
            session.auditLog[0],
            {
                type: "checkout.created",
                timestamp:
                    session.auditLog[0].timestamp,
                total: 55000,
                cartVersion:
                    session.cartVersion,
            }
        );
    } finally {
        server.close();
    }
});