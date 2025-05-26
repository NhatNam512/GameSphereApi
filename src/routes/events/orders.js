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
const { default: mongoose } = require('mongoose');
const Joi = require('joi');

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
    const session = await mongoose.startSession();
    session.startTransaction();
    // Khai báo order ở ngoài try block
    let order = null;
    try {
        // Validation đầu vào
        const schema = Joi.object({
            orderId: Joi.string().hex().length(24).required(),
            paymentId: Joi.string().required()
        });
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { orderId, paymentId } = req.body;

        // Tìm đơn hàng trước và gán vào biến order đã khai báo
        order = await orderModel.findById(orderId).session(session);

        // Kiểm tra xem đơn hàng có tồn tại không
        if (!order) {
             await session.abortTransaction();
             return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        // Tiếp tục tìm user và event sử dụng thông tin từ order
        const [user, event] = await Promise.all([
            User.findById(order.userId).session(session),
            Event.findById(order.eventId).session(session)
        ]);

        // Kiểm tra user và event
        if (!user || !event) {
             await session.abortTransaction();
             return res.status(404).json({ success: false, message: "Không tìm thấy người dùng hoặc sự kiện liên quan đến đơn hàng." });
        }


        console.log("Order: "+order);

        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: `Đơn hàng đã được xử lý (${order.status}).` });
        }

        if (event.endDate < new Date()) {
            return res.status(400).json({ success: false, message: "Sự kiện đã kết thúc." });
        }

        // Kiểm tra số vé tồn
        if (event.soldTickets + order.amount > event.ticketQuantity) {
            await orderModel.updateOne({ _id: orderId }, { status: "cancelled" }, { session });
            await session.commitTransaction();
            return res.status(400).json({ success: false, message: "Không đủ vé." });
        }

        // Kiểm tra Redis lock
        const redisKeys = order?.seats?.map(seat => `seatLock:${order.eventId}:${seat.seatId}`) || [];
        if (redisKeys.length > 0) {
            const lockedBy = await Promise.all(redisKeys.map(key => redisClient.get(key)));
            if (lockedBy.some(lock => lock && lock !== order.userId.toString())) {
                return res.status(400).json({ success: false, message: "Ghế đang được giữ bởi người dùng khác." });
            }
        }

        // Kiểm tra ghế đã được đặt
        if (order?.seats?.length > 0) {
            const bookedSeats = await seatModel.find({
                eventId: order.eventId,
                'seats.seatId': { $in: order.seats.map(s => s.seatId) },
                status: 'booked'
            }).session(session);
            if (bookedSeats.length > 0) {
                await redisClient.del(redisKeys);
                return res.status(400).json({ success: false, message: "Một số ghế đã được đặt." });
            }
        }

        // Cập nhật trạng thái đơn hàng
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending" },
            { $set: { status: "paid" } },
            { session }
        );

        if (updatedOrder.modifiedCount === 0) {
            await redisClient.del(redisKeys);
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Đơn hàng đã được xử lý bởi tiến trình khác." });
        }

        // Cập nhật số vé đã bán
        await Event.updateOne(
            { _id: event._id, soldTickets: { $lte: event.ticketQuantity - order.amount } },
            { $inc: { soldTickets: order.amount } },
            { session }
        );

        // Tạo vé
        const ticketsToInsert = [];
        const baseTicketData = {
            orderId: order._id,
            userId: order.userId,
            eventId: order.eventId,
            amount: 1,
            status: "issued",
            createdAt: new Date()
        };

        if (order.seats?.length > 0) {
            for (const seat of order.seats) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                ticketsToInsert.push({
                    ...baseTicketData,
                    ticketId,
                    ticketNumber,
                    qrCode,
                    seat: { seatId: seat.seatId }
                });
            }
        } else {
            for (let i = 0; i < order.amount; i++) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                ticketsToInsert.push({
                    ...baseTicketData,
                    ticketId,
                    ticketNumber,
                    qrCode
                });
            }
        }

        const createdTickets = await Ticket.insertMany(ticketsToInsert, { session });

        // Cập nhật trạng thái ghế
        if (order.seats?.length > 0) {
            console.log("Creating seat booking for order:", order._id);
            console.log("userId:", order.userId, "eventId:", order.eventId);
            await seatModel.create([{
                eventId: order.eventId,
                userId: order.userId,
                seats: order.seats,
                totalPrice: order.totalPrice,
                status: 'booked'
            }], { session });
        }

        // Xóa Redis lock
        if (redisKeys.length > 0) {
             await redisClient.del(redisKeys);
        }

        // Gửi thông báo
        await notificationService.sendTicketNotification(user, event.name, event.avatar, event._id, order);

        await session.commitTransaction();
        return res.status(200).json({ success: true, data: createdTickets });

    } catch (e) {
        await session.abortTransaction();
        // order đã được khai báo ở ngoài, nên có thể truy cập ở đây (nếu nó đã được gán giá trị trong try)
        // Sử dụng Optional Chaining (?.) để tránh lỗi nếu order vẫn là null/undefined khi vào catch
        const redisKeysToDelete = order?.seats?.map(seat => `seatLock:${order.eventId}:${seat.seatId}`) || [];
        // Chỉ gọi del nếu có khóa cần xóa
        if (redisKeysToDelete.length > 0) {
            await redisClient.del(redisKeysToDelete);
        }
        console.error('Error creating ticket:', e);

        if (e.name === 'MongoServerError' && e.code === 11000) {
            return res.status(400).json({ success: false, message: "Trùng vé. Vui lòng thử lại." });
        }
        if (e.message.includes('Redis')) {
            return res.status(503).json({ success: false, message: "Lỗi kết nối Redis." });
        }
        return res.status(500).json({ success: false, message: "Lỗi hệ thống khi tạo vé." });
    } finally {
        session.endSession();
    }
});

module.exports = router;