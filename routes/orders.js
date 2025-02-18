var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const orderModel = require('../models/orderModel');
const Ticket = require('../models/ticketModel');
const Event = require('../models/eventModel');

router.post("/createOrder", async function(req, res) {
    try {
        const { userId, eventId, amount } = req.body;
        const newOrder = { userId, eventId, amount, status: "pending" };
        await orderModel.create(newOrder);
        res.status(200).json({
            status: true,
            message: "Successfully",
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo đơn hàng." });
    }
});

const generateTicketNumber = async () => {
    const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
    return lastTicket ? lastTicket.ticketNumber + 1 : 100000; // Bắt đầu từ 100000
};

router.post("/createTicket", async function (req, res) {
    try {
        const { orderId, paymentId } = req.body;

        // Tìm đơn hàng
        const order = await orderModel.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // Cập nhật trạng thái đơn hàng
        order.status = "paid";
        await order.save();

        // Tạo mã QR cho vé
        const qrCode = `event-${order.eventId}-user-${order.userId}`;

        // Kiểm tra vé còn không
        const event = await Event.findById(order.eventId);
        if (event.soldTickets >= event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Hết vé" });
        }

        const ticketNumber = await generateTicketNumber();
        const ticket = new Ticket({ orderId: order._id, userId: order.userId, eventId: order.eventId, qrCode, ticketNumber });
        await ticket.save();

        await Event.findByIdAndUpdate(order.eventId, { $inc: { soldTickets: 1 } }); // Cập nhật số vé đã bán

        res.status(200).json({ success: true, ticket });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo vé." });
    }
});

module.exports = router;