const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
});

const Razorpay = require("razorpay");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createRazorpayOrder(amountInRupees) {
    if (
        typeof amountInRupees !== "number" ||
        !Number.isFinite(amountInRupees) ||
        amountInRupees <= 0
    ) {
        throw new Error("Amount must be a positive number");
    }

    const amountInPaise = Math.round(amountInRupees * 100);

    const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
    });
    return order;
}

async function fetchRazorpayPayment(paymentId) {
    if (typeof paymentId !== "string" || !paymentId) {
        throw new Error("Invalid Razorpay payment ID");
    }

    return razorpay.payments.fetch(paymentId);
}

function verifyRazorpayPayment(
    orderId,
    paymentId,
    signature
) {
    if (
        typeof orderId !== "string" ||
        typeof paymentId !== "string" ||
        typeof signature !== "string"
    ) {
        throw new Error("Invalid payment verification data");
    }

    const generatedSignature =
        crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_KEY_SECRET
            )
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

    return generatedSignature === signature;
}

module.exports = {
    createRazorpayOrder,
    verifyRazorpayPayment,
    fetchRazorpayPayment,
    razorpay,
};