const path = require("path");

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

module.exports = {
    createRazorpayOrder,
};