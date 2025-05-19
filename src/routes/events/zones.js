var express = require('express');
const authenticate = require('../../middlewares/auth');
const { seat, blockSeats } = require('../../controllers/events/zoneController');
const router = express.Router();

router.post('/addSeats', authenticate, seat);

router.get('/blockedSeats', blockSeats);

module.exports = router;