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