var express = require('express');
var router = express.Router();
const JWT = require('jsonwebtoken');
const config = require("../../utils/tokenConfig");
const orderModel = require('../../models/events/orderModel');
const { createOrder, createTicket } = require('../../controllers/orders/orders');
const ordersController = require('../../controllers/events/orders');

router.get("/getOrders", async function (req, res) {
    try {
        const orders = await orderModel.find()
            .populate('eventId')
            .populate('userId');

        return res.status(200).json({
            success: true,
            message: "Lấy đơn hàng thành công",
            data: orders
        });
    } catch (e) {
        return res.status(500).json({ success: false, message: "Lấy đơn hàng thất bại" + e });
    }
});

router.post("/createOrder", createOrder);
router.post("/createTicket", createTicket);
router.get('/buyers/:eventId', ordersController.getBuyersByEvent);

// Lấy toàn bộ order của 1 sự kiện
router.get('/event/:eventId', async function (req, res) {
    try {
        const { eventId } = req.params;
        const orders = await orderModel.find({ eventId })
            .populate('userId', 'email username');
        return res.status(200).json({
            success: true,
            message: "Lấy đơn hàng của sự kiện thành công",
            data: orders
        });
    } catch (e) {
        return res.status(500).json({ success: false, message: "Lấy đơn hàng thất bại" + e });
    }
});

module.exports = router;