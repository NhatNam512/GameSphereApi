var express = require('express');
const router = express.Router();
const {authenticate} = require('../../middlewares/auth');
const { reserveSeats, createZone, cancelAllReservedSeats} = require('../../controllers/events/zoneControllerOptimized');
const { createZoneTicket, reserveTickets } = require('../../controllers/events/zoneTicketController');
const seatsController = require('../../controllers/events/zoneController');

router.post('/reserveSeats', authenticate, reserveSeats);

router.post('/createZone', authenticate, createZone);

router.post('/createZoneTicket', authenticate, createZoneTicket);

router.post('/reserveZoneTicket', authenticate, reserveTickets);

router.post('/cancelAllReservedSeats', authenticate, cancelAllReservedSeats);

module.exports = router;