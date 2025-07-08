const SeatBooking = require('../../models/events/seatBookingModel');
const User = require('../../models/userModel');

exports.getCheckedInUsersByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const checkedIn = await SeatBooking.find({ eventId, status: 'checked-in' }).populate('userId', 'username email phone');
    const users = checkedIn.map(item => item.userId);
    res.json({ status: true, data: users });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
}; 