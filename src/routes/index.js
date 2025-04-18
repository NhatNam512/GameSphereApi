const express = require('express');
const router = express.Router();

const eventRouter = require('./events/events');
const categoryRouter = require('./events/categories');
const orderRouter = require('./events/orders');
const ticketRouter = require('./events/tickets');
const previewRouter = require('./events/previewEvent');
const emailRouter = require('./events/emails');
const paymentRouter = require('./events/payments');
const recommendRouter = require('./events/recommendation');
const usersRouter = require('./events/users');

var gamesRouter = require('./games/games');
var categoriesGamesRouter = require('./games/categoriesGames');
var previewGameRouter = require('./games/previewGame');

router.use('/events', eventRouter);
router.use('/categories', categoryRouter);
router.use('/orders', orderRouter);
router.use('/tickets', ticketRouter);
router.use('/preview', previewRouter);
router.use("/payments", paymentRouter);
router.use("/emails", emailRouter);
router.use("/recommend", recommendRouter);
router.use('/users', usersRouter);
router.use('/games', gamesRouter);
router.use("/categories_games", categoriesGamesRouter);
router.use("/previewGame", previewGameRouter);

module.exports = router;