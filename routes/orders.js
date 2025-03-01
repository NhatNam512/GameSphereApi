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
        if (!userId || !eventId || !amount || amount < 1) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin hoặc số lượng vé không hợp lệ." });
        }

        // Kiểm tra sự kiện còn vé không
        const event = await Event.findById(eventId);
        if (!event || event.soldTickets + amount > event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }

        // Tạo đơn hàng
        const newOrder = { userId, eventId, amount, status: "pending" };
        const createdOrder = await orderModel.create(newOrder);

        res.status(200).json({
            success: true,
            message: "Successfully",
            data: createdOrder._id,
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
    try {
        const { orderId, paymentId } = req.body;
        if (!orderId || !paymentId) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc." });
        }

        // Tìm đơn hàng
        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        // Kiểm tra trạng thái đơn hàng
        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: "Đơn hàng đã được thanh toán hoặc hủy." });
        }

        // Kiểm tra vé còn không
        const event = await Event.findById(order.eventId);
        if (!event || event.soldTickets + order.amount > event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }

        // Cập nhật trạng thái đơn hàng
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending" },
            { $set: { status: "paid" } }
        );

        if (updatedOrder.modifiedCount === 0) {
            return res.status(400).json({ success: false, message: "Đơn hàng đã bị thay đổi trạng thái trước đó." });
        }

        // Tạo số vé
        const ticketNumber = await generateTicketNumber();

        // Tạo mã QR
        const qrCodeData = `${ticketNumber}`;
        const qrCode = await QRCode.toDataURL(qrCodeData);

        const ticket = new Ticket({
            orderId: order._id,
            userId: order.userId,
            eventId: order.eventId,
            qrCode: qrCode,
            ticketNumber: ticketNumber,
            amount: order.amount,
            status: "issued",
            createdAt: new Date(),
        });

        await ticket.save();

        // Cập nhật số vé đã bán
        const updatedEvent = await Event.updateOne(
            { _id: event._id, soldTickets: { $lte: event.ticketQuantity - order.amount } },
            { $inc: { soldTickets: order.amount } }
        );

        if (updatedEvent.modifiedCount === 0) {
            return res.status(400).json({ success: false, message: "Không đủ vé, vui lòng thử lại." });
        }

        res.status(200).json({ success: true, data: ticket });

    } catch (e) {
        console.log(e);
        res.status(500).json({ success: false, message: "Lỗi khi tạo vé." });
    }
});


module.exports = router;