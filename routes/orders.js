var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const orderModel = require('../models/orderModel');
const Ticket = require('../models/ticketModel');
const Event = require('../models/eventModel');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

router.post("/createOrder", async function (req, res) {
    try {
        const { userId, eventId, amount } = req.body;
        const newOrder = { userId, eventId, amount, status: "pending" };
        const createdOrder = await orderModel.create(newOrder);
        res.status(200).json({
            status: true,
            message: "Successfully",
            orderId: createdOrder._id,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo đơn hàng." });
    }
});

const generateTicketNumber = async () => {
    let ticketNumber;
    let isUnique = false;

    while (!isUnique) {
        ticketNumber = await Ticket.findOne().sort({ ticketNumber: -1 }).then(ticket => ticket ? ticket.ticketNumber + 1 : 100000);
        const existingTicket = await Ticket.findOne({ ticketNumber });
        isUnique = !existingTicket; // Kiểm tra xem số vé đã tồn tại hay chưa
    }

    return ticketNumber;
};

router.post("/createTicket", async function (req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { orderId, paymentId } = req.body;
        if (!orderId || !paymentId) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc." });
        }
        // Tìm đơn hàng
        const order = await orderModel.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // Kiểm tra trạng thái đơn hàng
        if (order.status !== "pending") {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Đơn hàng đã được thanh toán hoặc hủy." });
        }

        // Kiểm tra vé còn không
        const event = await Event.findById(order.eventId).session(session);
        if (!event || event.soldTickets >= event.ticketQuantity) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Hết vé" });
        }

        // Cập nhật trạng thái đơn hàng
        order.status = "paid";
        await order.save({ session });

        // Tạo mã QR
        const qrCodeData = `event-${order.eventId}-user-${order.userId}`;
        const qrCode = await QRCode.toDataURL(qrCodeData);

        // Tạo số vé
        const ticketNumber = await generateTicketNumber();
        const ticket = new Ticket({ 
            orderId: order._id, 
            userId: order.userId, 
            eventId: order.eventId, 
            qrCode: qrCode, 
            ticketNumber: ticketNumber,
            status: "issued",
            createAt: new Date(),
        });

        await ticket.save({ session });

        // Cập nhật số vé đã bán
        event.soldTickets += 1;
        await event.save({ session });
        
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ success: true, ticket });
        
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        console.error(error);
        res.status(500).json({ success: false, message: "Lỗi khi tạo vé." });
    }
});

module.exports = router;