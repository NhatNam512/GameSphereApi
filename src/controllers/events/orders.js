const Order = require('../../models/events/orderModel');
const User = require('../../models/userModel');
const Event = require('../../models/events/eventModel');
const Ticket = require('../../models/events/ticketModel');

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

// Lấy lịch sử đơn hàng của người dùng
exports.getUserOrderHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    
    // Validate userId
    if (!userId) {
      return res.status(400).json({ 
        status: false, 
        message: 'Thiếu thông tin người dùng' 
      });
    }

    // Build query
    const query = { userId };
    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get orders with pagination
    const orders = await Order.find(query)
      .populate('eventId', 'name location timeStart timeEnd avatar')
      .populate('userId', 'username email phone fullname picUrl')
      .sort({ createdAt: -1 }) // Sắp xếp theo thời gian tạo đơn hàng mới nhất lên đầu
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    // Get ticket information for each order
    const ordersWithTickets = await Promise.all(
      orders.map(async (order) => {
        const tickets = await Ticket.find({ orderId: order._id })
          .populate('eventId', 'name')
          .lean();
        
        return {
          ...order,
          tickets: tickets,
          ticketCount: tickets.length
        };
      })
    );

    res.json({
      status: true,
      data: {
        orders: ordersWithTickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy lịch sử đơn hàng:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Lỗi hệ thống khi lấy lịch sử đơn hàng' 
    });
  }
};

// Lấy chi tiết đơn hàng
exports.getOrderDetail = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.query; // Để kiểm tra quyền truy cập

    if (!orderId) {
      return res.status(400).json({ 
        status: false, 
        message: 'Thiếu thông tin đơn hàng' 
      });
    }

    // Get order with full details
    const order = await Order.findById(orderId)
      .populate('eventId', 'name location timeStart timeEnd avatar description')
      .populate('userId', 'username email phone fullname picUrl')
      .populate('giftRecipientUserId', 'username email fullname picUrl')
      .lean();

    if (!order) {
      return res.status(404).json({ 
        status: false, 
        message: 'Không tìm thấy đơn hàng' 
      });
    }

    // Check if user has permission to view this order
    if (userId && order.userId._id.toString() !== userId) {
      return res.status(403).json({ 
        status: false, 
        message: 'Bạn không có quyền xem đơn hàng này' 
      });
    }

    // Get tickets for this order
    const tickets = await Ticket.find({ orderId })
      .populate('eventId', 'name')
      .lean();

    // Calculate order statistics
    const orderStats = {
      totalTickets: tickets.length,
      totalAmount: order.totalPrice,
      orderDate: order.createdAt,
      status: order.status
    };

    res.json({
      status: true,
      data: {
        order: {
          ...order,
          tickets,
          stats: orderStats
        }
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy chi tiết đơn hàng:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Lỗi hệ thống khi lấy chi tiết đơn hàng' 
    });
  }
};

// Lấy thống kê đơn hàng của người dùng
exports.getUserOrderStats = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        status: false, 
        message: 'Thiếu thông tin người dùng' 
      });
    }

    // Get order statistics
    const totalOrders = await Order.countDocuments({ userId });
    const completedOrders = await Order.countDocuments({ userId, status: 'completed' });
    const pendingOrders = await Order.countDocuments({ userId, status: 'pending' });
    const cancelledOrders = await Order.countDocuments({ userId, status: 'cancelled' });

    // Get total spent
    const totalSpent = await Order.aggregate([
      { $match: { userId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);

    // Get recent orders (last 5) - sắp xếp theo thời gian tạo đơn hàng mới nhất
    const recentOrders = await Order.find({ userId })
      .populate('eventId', 'name image timeStart')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      status: true,
      data: {
        stats: {
          totalOrders,
          completedOrders,
          pendingOrders,
          cancelledOrders,
          totalSpent: totalSpent[0]?.total || 0
        },
        recentOrders
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy thống kê đơn hàng:', error);
    res.status(500).json({ 
      status: false, 
      message: 'Lỗi hệ thống khi lấy thống kê đơn hàng' 
    });
  }
}; 