var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

const mongoose = require('mongoose');
const {initializeSocket } = require("./socket/socket");

require("./models/userModel");
require("./models/events/categoryModel");
require("./models/events/eventModel");
require("./models/events/orderModel");
require("./models/events/ticketModel");
require("./models/plants/plantModel");
require("./models/plants/plantCategoryModel");
require("./models/games/gameModel");
require("./models/games/previewGameModel");
require("./models/games/categoriesGameModel");
require("./models/games/previewGameModel")

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var categoriesRouter = require('./routes/categories');
var eventsRouter = require('./routes/events');
var ordersRouter = require('./routes/orders');
var ticketsRouter = require('./routes/tickets');
var plantsRounter = require('./routes/plants');
var plantCategoriesRouter = require('./routes/plantCategories');
var paymentRouter = require("./routes/payments");
var emailRouter = require("./routes/emails");
var gamesRouter = require('./routes/games');
var recommendRouter = require("./routes/recommendation");
var categoriesGamesRouter = require('./routes/categoriesGames');
var previewGameRouter = require('./routes/previewGame');

var app = express();
var http = require('http');
var server = http.createServer(app);
const io = initializeSocket(server);
io.on("connection", (socket) => {
    console.log("Client đã kết nối:", socket.id);
});
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
//connect database
mongoose.connect('mongodb+srv://namnnps38713:wcVNA8PAeuqTioxq@namnnps38713.bctmi.mongodb.net/gamesphere')
  .then(() => console.log('>>>>>>>>>> DB Connected!!!!!!'))
  .catch(err => console.log('>>>>>>>>> DB Error: ', err));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/games', gamesRouter);
app.use('/categories', categoriesRouter);
app.use('/events', eventsRouter);
app.use('/orders', ordersRouter);
app.use('/tickets', ticketsRouter);
app.use('/plants', plantsRounter);
app.use('/plantCategories', plantCategoriesRouter);
app.use("/payments", paymentRouter);
app.use("/emails", emailRouter);
app.use("/recommend", recommendRouter);
app.use("/categories_games", categoriesGamesRouter);
app.use("/previewGame", previewGameRouter);
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});


// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
