const zoneModel = require("../../models/events/zoneModel");

exports.blockSeats = async (req, res) => {
    try {
        const { eventId } = req.query;
        const bookings = await zoneModel.find({ eventId, status: 'booked' });
        const blockedSeats = bookings.flatMap(b => b.seats.map(s => s.seatId));
        res.status(200).json({
            eventId,
            blockedSeats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.seat = async (req, res) => {
    try {
        const userId = req.user.id
        const { eventId, seats, totalPrice } = req.body;
        if (!eventId || !userId || !totalPrice || !Array.isArray(seats) || seats.length === 0) {
            return res.status(400).json({ message: 'Thiếu thông tin đặt ghế.' });
        }
        const seatIds = seats.map(s => s.seatId);
        const conflict = await zoneModel.findOne({
            eventId,
            'seats.seatId': { $in: seatIds },
            status: 'booked',
        });
        const booking = new zoneModel({
            eventId,
            userId,
            seats,
            totalPrice,
        });

        await booking.save();

        res.status(200).json({ message: 'Đặt ghế thành công.', booking });
        if (conflict) {
            return res.status(400).json({ message: 'Một số ghế đã được đặt.' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}