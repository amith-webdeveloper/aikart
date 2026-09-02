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

module.exports = {
    createPaymentState,
    transitionPayment
};