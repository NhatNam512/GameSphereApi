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
const redisClient = require('../../redis/redisClient');
const seatModel = require('../../models/events/seatModel');
const { getSocketIO } = require('../../../socket/socket');

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
        return res.status(500).json({ success: false, message: "Lấy đơn hàng thất bại" + e });
    }
});

router.post("/createOrder", async function (req, res) {
    try {
        const { userId, eventId, amount, seats } = req.body;
        if (!userId || !eventId || !amount || amount < 1) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin hoặc số lượng vé không hợp lệ." });
        }
        // Kiểm tra sự kiện còn vé không
        const event = await Event.findById(eventId);
        if (!event || event.soldTickets + amount > event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }
        // Remove Redis seat lock check and setting

        // Tạo đơn hàng
        const newOrder = { userId, eventId, amount, seats, status: "pending" }; // Keep status as pending initially
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
    let order; // Khai báo biến order ở đây
    try {
        const { orderId, paymentId } = req.body;
        if (!orderId || !paymentId) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc." });
        }

        order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        const user = await User.findById(order.userId);
        const event = await Event.findById(order.eventId);

        if (!event) {
            return res.status(404).json({ success: false, message: "Không tìm thấy sự kiện." });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: "Đơn hàng đã được xử lý." });
        }

        // Kiểm tra Redis lock
        for (const seat of order.seats) {
            const redisKey = `seatLock:${order.eventId}:${seat.seatId}`;
            const lockedBy = await redisClient.get(redisKey);
            console.log(`Seat ${seat.seatId} locked by:`, lockedBy);
            // Nếu không có Redis lock thì bỏ qua, tiếp tục
        }

        // Kiểm tra số vé tồn
        if (event.soldTickets + order.amount > event.ticketQuantity) {
            for (const seat of order.seats) {
                await redisClient.del(`seatLock:${order.eventId}:${seat.seatId}`);
            }
            await orderModel.updateOne({ _id: orderId }, { status: "cancelled" });
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }

        // Cập nhật đơn hàng sang paid
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending" },
            { $set: { status: "paid" } }
        );

        if (updatedOrder.modifiedCount === 0) {
            const finalOrder = await orderModel.findById(orderId);
            for (const seat of order.seats) {
                await redisClient.del(`seatLock:${order.eventId}:${seat.seatId}`);
            }
            return res.status(400).json({
                success: false,
                message: `Đơn hàng đã xử lý bởi tiến trình khác (${finalOrder.status}).`
            });
        }

        // Tạo vé
        const createdTickets = [];

        if (order.seats && order.seats.length > 0) {
            // Tạo vé cho từng ghế nếu có ghế
            for (const seat of order.seats) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCodeData = `TicketID: ${ticketId}`;
                const qrCode = await QRCode.toDataURL(qrCodeData);

                const ticket = new Ticket({
                    orderId: order._id,
                    userId: order.userId,
                    eventId: order.eventId,
                    qrCode,
                    ticketId,
                    ticketNumber,
                    amount: 1, // Mỗi vé cho 1 ghế
                    status: "issued",
                    createdAt: new Date(),
                    seat: {
                        seatId: seat.seatId
                    }
                });

                await ticket.save();
                createdTickets.push(ticket);
            }
        } else {
            // Tạo vé dựa trên số lượng nếu không có ghế
            for (let i = 0; i < order.amount; i++) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCodeData = `TicketID: ${ticketId}`;
                const qrCode = await QRCode.toDataURL(qrCodeData);

                const ticket = new Ticket({
                    orderId: order._id,
                    userId: order.userId,
                    eventId: order.eventId,
                    qrCode,
                    ticketId,
                    ticketNumber,
                    amount: 1, // Mỗi lần lặp tạo 1 vé
                    status: "issued",
                    createdAt: new Date(),
                    // Không thêm thông tin seat
                });

                await ticket.save();
                createdTickets.push(ticket);
            }
        }

        // Cập nhật số vé đã bán
        await Event.updateOne(
            { _id: event._id, soldTickets: { $lte: event.ticketQuantity - order.amount } },
            { $inc: { soldTickets: order.amount } }
        );

        // Xóa Redis lock
        for (const seat of order.seats) {
            await redisClient.del(`seatLock:${order.eventId}:${seat.seatId}`);
        }

        // Gửi thông báo
        await notificationService.sendTicketNotification(user, event.name, event.avatar, event._id);

        // Cập nhật trạng thái các ghế trong seatModel thành 'booked'
        // Tạo một mục nhập mới trong seatModel cho đơn hàng đã thanh toán
        await seatModel.create({
            eventId: order.eventId,
            userId: order.userId,
            seats: order.seats, // Lưu thông tin ghế từ đơn hàng
            totalPrice: order.totalPrice, // Giả định orderModel có totalPrice
            status: 'booked' // Đặt trạng thái là booked
        });

        // Lấy instance Socket.IO và emit sự kiện seat_booked
        const io = getSocketIO();
        io.to(`event_${order.eventId}`).emit('seat_booked', {
            eventId: order.eventId,
            seats: order.seats.map(s => ({ seatId: s.seatId, status: 'booked' })) // Chỉ gửi seatId và trạng thái
        });

        return res.status(200).json({ success: true, data: createdTickets });

    } catch (e) {
        console.error(e);
        if (order && order.seats) {
            for (const seat of order.seats) {
                // Xóa Redis lock
                await redisClient.del(`seatLock:${order.eventId}:${seat.seatId}`);

                // Emit sự kiện seat_released nếu đơn hàng bị hủy/lỗi sau khi khóa đã được đặt
                const io = getSocketIO();
                io.to(`event_${order.eventId}`).emit('seat_released', {
                    eventId: order.eventId,
                    seats: [{ seatId: seat.seatId, status: 'available' }]
                });
            }
        }
        if (e.code === 11000) {
            return res.status(400).json({ success: false, message: "Trùng vé. Vui lòng thử lại." });
        }
        return res.status(500).json({ success: false, message: "Lỗi khi tạo vé." });
    }
});


module.exports = router;