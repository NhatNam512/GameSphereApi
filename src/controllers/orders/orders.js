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
const showtimeModel = require("../../models/events/showtimeModel");
const { sendTicketEmail } = require('../../services/mailService');

exports.createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { userId, eventId, showtimeId, bookingIds, bookingType, totalPrice } = req.body;

        // Validate bookingType
        const validTypes = ['none', 'seat', 'zone'];
        if (!validTypes.includes(bookingType)) {
            return res.status(400).json({ success: false, message: "Loại đặt vé không hợp lệ." });
        }

        // Validate chung
        if (!userId || !eventId || !showtimeId || !totalPrice || totalPrice < 0) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin hoặc dữ liệu không hợp lệ." });
        }

        // Validate bookingIds và totalAmount dựa trên bookingType
        if (bookingType === 'none') {
            // Nếu bookingType là 'none', không cần bookingIds nhưng cần totalAmount
            if (bookingIds && bookingIds.length > 0) {
                return res.status(400).json({ success: false, message: "Loại đặt vé 'none' không cần bookingIds." });
            }
            if (!req.body.totalAmount || req.body.totalAmount <= 0) {
                return res.status(400).json({ success: false, message: "Thiếu thông tin số lượng vé (totalAmount) cho loại đặt vé 'none'." });
            }
        } else {
            // Nếu bookingType là 'seat' hoặc 'zone', cần bookingIds
            if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
                return res.status(400).json({ success: false, message: "Thiếu thông tin bookingIds hoặc dữ liệu không hợp lệ." });
            }
        }

        // Lấy showtime
        const showtime = await showtimeModel.findById(showtimeId);
        if (!showtime) {
            return res.status(400).json({ success: false, message: "Không tìm thấy suất chiếu." });
        }

        let totalAmount = 0;
        const validBookings = [];
        
        // Xử lý bookingIds chỉ khi bookingType không phải 'none'
        if (bookingType !== 'none') {
            for (const bId of bookingIds) {
                // Thử tìm booking ghế
                let seatBooking = await seatModel.findById(bId);
                if (seatBooking && seatBooking.userId.toString() === userId.toString() && seatBooking.status === 'reserved') {
                    // Kiểm tra số lượng vé còn lại theo showtime
                    if (showtime.soldTickets + seatBooking.seats.length > showtime.ticketQuantity) {
                        return res.status(400).json({ success: false, message: "Không đủ vé suất chiếu cho số lượng ghế đã giữ." });
                    }
                    totalAmount += seatBooking.seats.length;
                    validBookings.push({ type: 'seat', booking: seatBooking });
                    continue;
                }
                // Thử tìm booking zone
                let zoneBooking = await ZoneBooking.findById(bId);
                if (zoneBooking && zoneBooking.userId.toString() === userId.toString() && zoneBooking.status === 'reserved') {
                    if (showtime.soldTickets + zoneBooking.quantity > showtime.ticketQuantity) {
                        return res.status(400).json({ success: false, message: "Không đủ vé suất chiếu cho số lượng khu vực đã giữ." });
                    }
                    totalAmount += zoneBooking.quantity;
                    validBookings.push({ type: 'zone', booking: zoneBooking });
                    continue;
                }
                return res.status(400).json({ success: false, message: `Thông tin giữ vé không hợp lệ hoặc đã hết hạn cho bookingId: ${bId}` });
            }
        } else {
            // Nếu bookingType là 'none', lấy totalAmount từ request body
            totalAmount = req.body.totalAmount || 1;
            // Kiểm tra số lượng vé còn lại theo showtime cho bookingType 'none'
            if (showtime.soldTickets + totalAmount > showtime.ticketQuantity) {
                return res.status(400).json({ success: false, message: "Không đủ vé suất chiếu cho số lượng vé yêu cầu." });
            }
        }

        // Tạo order
        const newOrder = {
            userId,
            eventId,
            showtimeId,
            amount: totalAmount,
            status: "pending",
            bookingType,
            totalPrice,
            bookingIds: bookingType === 'none' ? [] : bookingIds
        };
        const createdOrder = await orderModel.create([newOrder], { session });
        // Gán orderId cho từng booking và chuyển trạng thái sang 'booked' (chỉ khi có booking)
        if (bookingType !== 'none') {
            for (const { type, booking } of validBookings) {
                booking.orderId = createdOrder[0]._id;
                booking.status = 'booked';
                await booking.save({ session });
            }
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
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo đơn hàng."+e });
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
        // Tìm user, event và showtime
        const [user, event, showtime] = await Promise.all([
            userModel.findById(order.userId).session(session),
            Event.findById(order.eventId).session(session),
            showtimeModel.findById(order.showtimeId).session(session)
        ]);
        if (!user || !event || !showtime) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng, sự kiện hoặc suất chiếu liên quan đến đơn hàng." });
        }
        if (order.status !== "pending") {
            return res.status(400).json({ success: false, message: `Đơn hàng đã được xử lý (${order.status}).` });
        }
        if (event.endDate < new Date()) {
            return res.status(400).json({ success: false, message: "Sự kiện đã kết thúc." });
        }
        // Sinh vé cho từng bookingId hoặc tạo vé mặc định cho bookingType 'none'
        let totalTickets = 0;
        const ticketsToInsert = [];
        
        if (order.bookingType === 'none') {
            // Tạo vé mặc định cho bookingType 'none'
            for (let i = 0; i < order.amount; i++) {
                const ticketNumber = await generateTicketNumber();
                const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                ticketsToInsert.push({
                    orderId: order._id,
                    userId: order.userId,
                    eventId: order.eventId,
                    showtimeId: order.showtimeId,
                    amount: 1,
                    totalPrice: order.totalPrice / order.amount,
                    status: "issued",
                    createdAt: new Date(),
                    ticketId,
                    ticketNumber,
                    qrCode
                    // Không có seat hoặc zone cho bookingType 'none'
                });
                totalTickets++;
            }
        } else {
            // Xử lý bookingIds cho bookingType 'seat' hoặc 'zone'
            for (const bId of order.bookingIds) {
                // Thử tìm booking ghế
                let seatBooking = await seatModel.findById(bId).session(session);
                if (seatBooking && seatBooking.status === 'booked') {
                    for (const seat of seatBooking.seats) {
                        const ticketNumber = await generateTicketNumber();
                        const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                        const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                        ticketsToInsert.push({
                            orderId: order._id,
                            userId: order.userId,
                            eventId: order.eventId,
                            showtimeId: order.showtimeId,
                            amount: 1,
                            totalPrice: order.totalPrice / order.amount,
                            status: "issued",
                            createdAt: new Date(),
                            ticketId,
                            ticketNumber,
                            qrCode,
                            seat: { seatId: seat.seatId, zoneId: seat.zoneId }
                        });
                        totalTickets++;
                    }
                    // Cập nhật trạng thái giữ chỗ ghế thành 'booked' (nếu cần)
                    seatBooking.status = 'booked';
                    await seatBooking.save({ session });
                    continue;
                }
                // Thử tìm booking zone
                let zoneBooking = await ZoneBooking.findById(bId).session(session);
                if (zoneBooking && zoneBooking.status === 'booked') {
                    const zone = await ZoneTicket.findById(zoneBooking.zoneId);
                    // Đếm số vé đã bán cho zone này
                    const soldZoneTickets = await Ticket.countDocuments({
                        'zone.zoneId': zoneBooking.zoneId,
                        showtimeId: zoneBooking.showtimeId
                    }).session(session);
                    if (soldZoneTickets + zoneBooking.quantity > zone.totalTicketCount) {
                        await session.abortTransaction();
                        return res.status(400).json({ success: false, message: `Không đủ vé cho zone này (zoneId: ${zoneBooking.zoneId}).` });
                    }
                    for (let i = 0; i < zoneBooking.quantity; i++) {
                        const ticketNumber = await generateTicketNumber();
                        const ticketId = `${event._id.toString().slice(-4)}-TCK${String(ticketNumber).padStart(6, '0')}`;
                        const qrCode = await QRCode.toDataURL(`TicketID:${ticketId}`);
                        ticketsToInsert.push({
                            orderId: order._id,
                            userId: order.userId,
                            eventId: order.eventId,
                            showtimeId: order.showtimeId,
                            amount: 1,
                            totalPrice: order.totalPrice / order.amount,
                            status: "issued",
                            createdAt: new Date(),
                            ticketId,
                            ticketNumber,
                            qrCode,
                            zone: { zoneId: zone._id, zoneName: zone.name }
                        });
                        totalTickets++;
                    }
                    // Cập nhật trạng thái giữ vé khu vực thành 'booked' (nếu cần)
                    zoneBooking.status = 'booked';
                    await zoneBooking.save({ session });
                    // Xóa Redis lock nếu có
                    const redisKey = `zoneReserve:${zoneBooking.zoneId}:${zoneBooking.userId}`;
                    await redisClient.del(redisKey);
                    continue;
                }
                await session.abortTransaction();
                return res.status(400).json({ success: false, message: `Thông tin giữ vé không hợp lệ hoặc đã hết hạn cho bookingId: ${bId}` });
            }
        }
        // Cập nhật số vé đã bán cho suất chiếu
        const updatedShowtime = await showtimeModel.findByIdAndUpdate(
            showtime._id,
            { $inc: { soldTickets: totalTickets } },
            { session, new: true, runValidators: true }
        );
        if (!updatedShowtime) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Không thể cập nhật số lượng vé đã bán." });
        }
        // Cập nhật trạng thái đơn hàng
        const updatedOrder = await orderModel.updateOne(
            { _id: orderId, status: "pending" },
            { $set: { status: "paid" } },
            { session }
        );
        if (updatedOrder.modifiedCount === 0) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Đơn hàng đã được xử lý bởi tiến trình khác." });
        }
        // Tạo vé
        const createdTickets = await Ticket.insertMany(ticketsToInsert, { session });
        // Xóa cache Redis chi tiết sự kiện
        await redisClient.del(`events_detail_${order.eventId}`);
        await session.commitTransaction();
        
        // Gửi email vé cho người dùng (không cần chờ để không ảnh hưởng response time)
        setTimeout(async () => {
            try {
                const ticketEmailData = {
                    user,
                    order,
                    event,
                    showtime,
                    tickets: createdTickets
                };
                await sendTicketEmail(ticketEmailData);
                console.log(`Email vé đã được gửi cho user ${user.email}`);
            } catch (emailError) {
                console.error('Lỗi gửi email vé:', emailError.message);
                // Không throw error để không ảnh hưởng đến response chính
            }
        }, 1000); // Delay 1 giây để đảm bảo transaction đã commit
        
        return res.status(200).json({ success: true, data: createdTickets });
    } catch (e) {
        await session.abortTransaction();
        return res.status(500).json({ success: false, message: "Lỗi hệ thống khi tạo vé." + e});
    } finally {
        session.endSession();
    }
};