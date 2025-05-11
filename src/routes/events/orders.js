var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const orderModel = require('../../models/events/orderModel');
const Ticket = require('../../models/events/ticketModel');
const Event = require('../../models/events/eventModel');
const User = require('../../models/userModel');
const QRCode = require('qrcode');
const Counter = require('../../models/events/counterModel')
const shortid = require('shortid');
const { sendUserNotification } = require('../../controllers/auth/sendNotification');
const notificationService = require('../../services/notificationService');

router.get("/getOrders", async function (req, res) {
    try {
        const orders = await orderModel.find()
            .populate('eventId', 'name')
            .populate('userId', 'username email');

        return res.status(200).json({
            success: true,
            message: "Lấy đơn hàng thành công",
            data: orders
        });
    } catch (e) {
        return res.status(500).json({ success: false, message: "Lấy đơn hàng thất bại" + e});
    }
});

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
    const counter = await Counter.findByIdAndUpdate(
        { _id: 'ticketNumber' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

router.post("/createTicket", async (req, res) => {
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

        const user = await User.findById(order.userId);
        const event = await Event.findById(order.eventId);

        // Kiểm tra đơn hàng và sự kiện
        if (!event) {
            return res.status(404).json({ success: false, message: "Không tìm thấy sự kiện." });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: "Đơn hàng đã được thanh toán hoặc hủy." });
        }

        if (event.soldTickets + order.amount > event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }

        // Cập nhật đơn hàng sang paid
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending" },
            { $set: { status: "paid" } }
        );
        if (updatedOrder.modifiedCount === 0) {
            return res.status(400).json({ success: false, message: "Đơn hàng đã bị thay đổi trạng thái trước đó." });
        }

        // Sinh ticketNumber và ticketId
        const ticketNumber = await generateTicketNumber();
        const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;

        // Tạo QR code
        const qrCodeData = `TicketID: ${ticketId}`;
        const qrCode = await QRCode.toDataURL(qrCodeData);

        // Tạo vé
        const ticket = new Ticket({
            orderId: order._id,
            userId: order.userId,
            eventId: order.eventId,
            qrCode: qrCode,
            ticketId: ticketId,
            ticketNumber: ticketNumber,
            amount: order.amount,
            status: "issued",
            createdAt: new Date(),
        });

        // Lưu vé và cập nhật soldTickets đồng thời
        await Promise.all([
            ticket.save(),
            Event.updateOne(
                { _id: event._id, soldTickets: { $lte: event.ticketQuantity - order.amount } },
                { $inc: { soldTickets: order.amount } }
            )
        ]);

        // Gửi notify nếu có token
        await notificationService.sendTicketNotification(user, event.name, event.avatar, event._id);

        return res.status(200).json({ success: true, data: ticket });

    } catch (e) {
        console.error(e);
        if (e.code === 11000) {
            return res.status(400).json({ success: false, message: "Vui lòng thử lại, số vé đã bị trùng." });
        }
        return res.status(500).json({ success: false, message: "Lỗi khi tạo vé." });
    }
});


module.exports = router;