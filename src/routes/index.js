const express = require('express');
const router = express.Router();

const eventRouter = require('./events/events');
const categoryRouter = require('./events/categories');
const orderRouter = require('./events/orders');
const ticketRouter = require('./events/tickets');
const previewRouter = require('./events/previewEvent');
const paymentRouter = require('./events/payments');
const recommendRouter = require('./events/recommendation');
const usersRouter = require('./events/users');
const interactionRouter = require('./events/interactions');
const friendRouter = require('./users/friends');
const zoneRouter = require('./events/seats');
const tagRoutes = require('./events/tags');
const groupRouter = require('./groups');

var gamesRouter = require('./games/games');
var categoriesGamesRouter = require('./games/categoriesGames');
var previewGameRouter = require('./games/previewGame');

// ✅ Socket Debug Routes - Thêm để test socket trên thiết bị thật
router.get('/socket/status', (req, res) => {
  try {
    const { getSocketIO, getConnectionStats } = require('../../socket/socket');
    const io = getSocketIO();
    const stats = getConnectionStats();
    
    res.json({
      success: true,
      message: 'Socket.IO is running',
      stats: stats,
      server: {
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3000,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Socket.IO not initialized',
      error: error.message
    });
  }
});

// Test endpoint cho mobile
router.get('/socket/mobile-test', (req, res) => {
  res.json({
    success: true,
    message: 'Server is reachable from mobile',
    serverTime: new Date().toISOString(),
    serverIP: req.ip,
    userAgent: req.get('User-Agent'),
    headers: req.headers
  });
});

router.post('/socket/test-broadcast', (req, res) => {
    try {
        const { broadcastToRoom } = require('../../socket/socket');
        const { roomId, event = 'testMessage', data } = req.body;
        
        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: 'roomId is required'
            });
        }

        const testData = data || {
            type: 'test',
            message: 'Test broadcast from server',
            timestamp: Date.now()
        };

        const success = broadcastToRoom(roomId, event, testData);
        
        res.json({
            success,
            message: success ? 'Broadcast sent successfully' : 'Failed to send broadcast',
            sentTo: roomId,
            event,
            data: testData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending broadcast',
            error: error.message
        });
    }
});

router.use('/events', eventRouter);
router.use('/categories', categoryRouter);
router.use('/orders', orderRouter);
router.use('/tickets', ticketRouter);
router.use('/preview', previewRouter);
router.use("/payments", paymentRouter);
router.use("/recommend", recommendRouter);
router.use('/users', usersRouter);
router.use('/games', gamesRouter);
router.use("/categories_games", categoriesGamesRouter);
router.use("/previewGame", previewGameRouter);
router.use("/interactions", interactionRouter);
router.use("/friends", friendRouter);
router.use("/zones", zoneRouter);
router.use('/tags', tagRoutes);
router.use('/connects', groupRouter);

module.exports = router;