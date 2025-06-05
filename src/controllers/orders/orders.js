const orderModel = require("../../models/events/orderModel");
const seatModel = require("../../models/events/seatBookingModel");
const ZoneBooking = require("../../models/events/zoneBookingModel");
const Event = require("../../models/events/eventModel");
const { default: mongoose } = require('mongoose');
const Joi = require('joi');
const QRCode = require('qrcode');
const Ticket = require("../../models/events/ticketModel");
const redisClient = require("../../redis/redisClient");
const notificationService = require("../../services/notificationService");
const Counter = require("../../models/events/counterModel");
const userModel = require("../../models/userModel");
const ZoneTicket = require("../../models/events/zoneTicketModel");
const { sendNotificationCore } = require("../auth/sendNotification");

exports.createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { userId, eventId, amount, bookingId, bookingType } = req.body;

        // Validate bookingType
        const validTypes = ['none', 'seat', 'zone'];
        if (!validTypes.includes(bookingType)) {
            return res.status(400).json({ success: false, message: "Loại đặt vé không hợp lệ." });
        }

        // Validate chung
        if (!userId || !eventId || !amount || amount < 1) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin hoặc số lượng vé không hợp lệ." });
        }

        // Kiểm tra trùng lặp order theo bookingId (nếu có)
        if (bookingId) {
            const existedOrder = await orderModel.findOne({ bookingId });
            if (existedOrder) {
                return res.status(400).json({ success: false, message: "Đơn hàng cho booking này đã tồn tại." });
            }
        }

        let newOrder = {
            userId,
            eventId,
            amount,
            status: "pending",
            bookingType
        };

        if (bookingType === 'none') {
            // Kiểm tra số lượng vé còn lại
            const event = await Event.findById(eventId);
            if (!event || event.soldTickets + amount > event.ticketQuantity) {
                return res.status(400).json({ success: false, message: "Không đủ vé sự kiện." });
            }
        }

        if (bookingType === 'seat') {
            const seatBooking = await seatModel.findById(bookingId);
            if (!seatBooking || seatBooking.userId.toString() !== userId || seatBooking.status !== 'reserved') {
                return res.status(400).json({ success: false, message: "Thông tin giữ chỗ ghế không hợp lệ hoặc đã hết hạn." });
            }
            const event = await Event.findById(eventId);
            if (!event || event.soldTickets + seatBooking.seats.length > event.ticketQuantity) {
                return res.status(400).json({ success: false, message: "Không đủ vé sự kiện cho số lượng ghế đã giữ." });
            }
            newOrder.amount = seatBooking.seats.length;
            newOrder.seats = seatBooking.seats;
            newOrder.bookingId = bookingId;
        }

        if (bookingType === 'zone') {
            const zoneBooking = await ZoneBooking.findById(bookingId);
            if (!zoneBooking || zoneBooking.userId.toString() !== userId || zoneBooking.status !== 'reserved') {
                return res.status(400).json({ success: false, message: "Thông tin giữ vé không hợp lệ hoặc đã hết hạn." });
            }
            newOrder.amount = zoneBooking.quantity;
            newOrder.zoneId = zoneBooking.zoneId;
            newOrder.bookingId = bookingId;
        }

        // Tạo order và cập nhật booking trong transaction
        const createdOrder = await orderModel.create([newOrder], { session });
        if (bookingType === 'seat') {
            await seatModel.findByIdAndUpdate(bookingId, { orderId: createdOrder[0]._id }, { session });
        }
        if (bookingType === 'zone') {
            await ZoneBooking.findByIdAndUpdate(bookingId, { orderId: createdOrder[0]._id }, { session });
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: "Tạo đơn hàng thành công.",
            data: createdOrder[0]._id,
        });
    } catch (e) {
        await session.abortTransaction();
        session.endSession();
        console.error(e);
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo đơn hàng." });
    }
}

const generateTicketNumber = async () => {
    const counter = await Counter.findByIdAndUpdate(
        { _id: 'ticketNumber' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

exports.createTicket = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    let order = null;
    let seatBooking = null;
    let zoneBooking = null;
    try {
        // Validate đầu vào
        const schema = Joi.object({
            orderId: Joi.string().hex().length(24).required(),
            paymentId: Joi.string().required()
        });
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { orderId, paymentId } = req.body;
        order = await orderModel.findById(orderId).session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng." });
        }

        // Tìm booking ghế hoặc khu vực nếu có
        if (order.bookingType === 'seat' && order.bookingId) {
            seatBooking = await seatModel.findById(order.bookingId).session(session);
            if (!seatBooking || seatBooking.status !== 'reserved') {
                await session.abortTransaction();
                return res.status(400).json({ success: false, message: "Thông tin giữ chỗ ghế không hợp lệ hoặc đã hết hạn." });
            }
        }
        if (order.bookingType === 'zone' && order.bookingId) {
            zoneBooking = await ZoneBooking.findById(order.bookingId).session(session);
            if (!zoneBooking || zoneBooking.status !== 'reserved') {
                await session.abortTransaction();
                return res.status(400).json({ success: false, message: "Thông tin giữ vé khu vực không hợp lệ hoặc đã hết hạn." });
            }
        }

        // Tìm user và event
        const [user, event] = await Promise.all([
            userModel.findById(order.userId).session(session),
            Event.findById(order.eventId).session(session)
        ]);
        if (!user || !event) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng hoặc sự kiện liên quan đến đơn hàng." });
        }

        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: `Đơn hàng đã được xử lý (${order.status}).` });
        }
        if (event.endDate < new Date()) {
            return res.status(400).json({ success: false, message: "Sự kiện đã kết thúc." });
        }
        // if (event.soldTickets + order.amount > event.ticketQuantity) {
        //     await session.abortTransaction();
        //     return res.status(400).json({ success: false, message: "Không đủ vé." });
        // }

        // Cập nhật trạng thái đơn hàng
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending", bookingId: order.bookingId },
            { $set: { status: "paid" } },
            { session }
        );
        if (updatedOrder.modifiedCount === 0) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Đơn hàng đã được xử lý bởi tiến trình khác hoặc bookingId không khớp." });
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

        if (order.bookingType === 'seat' && order.seats?.length > 0) {
            for (const seat of order.seats) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                ticketsToInsert.push({
                    ...baseTicketData,
                    ticketId,
                    ticketNumber,
                    qrCode,
                    seat: { seatId: seat.seatId, zoneId: seat.zoneId }
                });
            }
        } else if (order.bookingType === 'zone' && zoneBooking) {
            for (let i = 0; i < zoneBooking.quantity; i++) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                const zone = await ZoneTicket.findById(zoneBooking.zoneId);
                ticketsToInsert.push({
                    ...baseTicketData,
                    ticketId,
                    ticketNumber,
                    qrCode,
                    zone: { zoneId: zone._id, zoneName: zone.name }
                });
            }
        } else if (order.bookingType === 'none') {
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
        } else {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Đơn hàng không có thông tin ghế hoặc khu vực." });
        }

        const createdTickets = await Ticket.insertMany(ticketsToInsert, { session });

        // Cập nhật trạng thái giữ chỗ ghế/khu vực thành 'booked'
        if (seatBooking) {
            seatBooking.status = 'booked';
            await seatBooking.save({ session });
        }
        if (zoneBooking) {
            zoneBooking.status = 'booked';
            await zoneBooking.save({ session });
        }

        // Xóa Redis lock nếu có (tuỳ vào cách bạn lock zone)
        if (zoneBooking) {
            const redisKey = `zoneReserve:${zoneBooking.zoneId}:${zoneBooking.userId}`;
            await redisClient.del(redisKey);
        }

        // Gửi thông báo
        // await notificationService.sendTicketNotification(user, event.name, event.avatar, event._id, order);
        // await sendNotificationCore(user.fcmTokens, "Đặt vé thành công", `Bạn đã đặt ${order.amount} vé cho sự kiện "${event.name}"`, {
        //     eventId: event._id,
        // }, "ticket", {
        //     eventName: event.name,
        //     eventId: event._id,
        //     orderId: order._id,
        //     amount: order.amount,
        //     bookingType: order.bookingType,
        // });
        await session.commitTransaction();
        return res.status(200).json({ success: true, data: createdTickets });

    } catch (e) {
        await session.abortTransaction();
        // ... giữ nguyên phần xử lý lỗi ...
        return res.status(500).json({ success: false, message: "Lỗi hệ thống khi tạo vé." });
    } finally {
        session.endSession();
    }
};