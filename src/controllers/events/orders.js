const Order = require('../../models/events/orderModel');
const User = require('../../models/userModel');

exports.getBuyersByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const orders = await Order.find({ eventId }).populate('userId', 'username email phone');
    const buyers = orders.map(order => order.userId);
    res.json({ status: true, data: buyers });
  } catch (e) {
    res.status(500).json({ status: false, message: 'Lỗi hệ thống.' });
  }
}; 