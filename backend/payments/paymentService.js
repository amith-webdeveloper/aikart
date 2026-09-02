const {
    verifyRazorpayPayment,
    fetchRazorpayPayment,
} = require("./razorpayService");

function createPaymentState(order) {
    if (!order || typeof order.id !== "string") {
        throw new Error("Invalid Razorpay order");
    }

    if (
        !Number.isInteger(order.amount) ||
        order.amount <= 0
    ) {
        throw new Error("Invalid payment amount");
    }

    return {
        status: "created",
        razorpayOrderId: order.id,
        amount: order.amount,
    };
}

function transitionPayment(payment, nextStatus) {
    if (!payment) {
        throw new Error("Payment does not exist");
    }

    if (
        payment.status === "created" &&
        ["paid", "failed", "cancelled"].includes(nextStatus)
    ) {
        payment.status = nextStatus;
        return payment;
    }

    throw new Error(
        `Invalid payment transition: ${payment.status} -> ${nextStatus}`
    );
}

async function verifyPaymentForSession(
    session,
    paymentId,
    signature
) {
    if (!session || !session.payment) {
        throw new Error("No active payment");
    }

    const payment = session.payment;

    if (payment.status !== "created") {
        throw new Error("Payment is no longer awaiting verification");
    }

    const isValid = verifyRazorpayPayment(
        payment.razorpayOrderId,
        paymentId,
        signature
    );

    if (!isValid) {
        throw new Error("Invalid payment signature");
    }

    const razorpayPayment =
        await fetchRazorpayPayment(paymentId);

    if (razorpayPayment.order_id !== payment.razorpayOrderId) {
        throw new Error("Payment does not belong to this order");
    }

    if (razorpayPayment.amount !== payment.amount) {
        throw new Error("Payment amount does not match the order");
    }

    if (razorpayPayment.status !== "captured") {
        throw new Error("Payment has not been captured");
    }

    return transitionPayment(
        payment,
        "paid"
    );
}

module.exports = {
    createPaymentState,
    transitionPayment,
    verifyPaymentForSession
};