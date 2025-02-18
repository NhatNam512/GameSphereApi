var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../until/tokenConfig");
const Ticket = require('../models/ticketModel');
const Event = require('../models/eventModel')
const mongoose = require('mongoose');

router.get("/getTicket/:userId", async function (req, res) {
    const tickets = await Ticket.find({ userId: req.params.userId }).populate("eventId");
    res.json({ success: true, tickets });
})

// const generateTicketNumber = async () => {
//     const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
//     return lastTicket ? lastTicket.ticketNumber + 1 : 100000; // Bắt đầu từ 100000
// };

router.post("/createTicket", async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { orderId, userId, eventId, quantity, ticketType, price, attendeeNames } = req.body;

        // Tìm sự kiện
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: "Sự kiện không tồn tại" });

        // Kiểm tra số vé còn lại
        if (event.soldTickets + quantity > event.ticketQuantity) {
            return res.status(400).json({ success: false, message: "Không đủ vé" });
        }

        let tickets = [];
        for (let i = 0; i < quantity; i++) {
            // Tạo số vé
            const ticketNumber = await generateTicketNumber();
            const ticket = new Ticket({
                orderId,
                userId,
                eventId,
                ticketNumber,
                ticketType,
                price,
                attendeeName: attendeeNames[i] || `Khách ${i + 1}`, // Nếu không có tên thì đặt tên mặc định
            });

            tickets.push(ticket);
        }

        // Lưu tất cả vé vào DB
        await Ticket.insertMany(tickets);

        // Cập nhật số vé đã bán
        await Event.findByIdAndUpdate(eventId, { $inc: { soldTickets: quantity } });

        res.json({ success: true, tickets });
    } catch (error) {
        await session.abortTransaction();
        console.error(error);
        return res.status(500).json({ success: false, message: "Đã xảy ra lỗi trong quá trình tạo vé." });
    } finally {
        session.endSession();
    }
});

module.exports = router;