var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
var { Server } = require('socket.io');
const WebSocket = require('ws');

const mongoose = require('mongoose');

require("./models/userModel");
require("./models/events/categoryModel");
require("./models/events/eventModel");
require("./models/events/orderModel");
require("./models/events/ticketModel");
require("./models/events/previewEventModel");
require("./models/plants/plantModel");
require("./models/plants/plantCategoryModel");
require("./models/games/gameModel");
require("./models/games/previewGameModel");
require("./models/games/categoriesGameModel");
require("./models/games/previewGameModel");
require("./models/plants/cartModel");

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
var previewEventRouter = require('./routes/previewEvent');
var cartRouter = require('./routes/carts');
var notificationRouter = require('./routes/notification');

var app = express();
var http = require('http');
var server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Đảm bảo client có thể kết nối
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("Client connected: " + socket.id);

  // Gửi tin nhắn mỗi 5s
  const interval = setInterval(() => {
    socket.emit("server-message", {
      message: "Hello from server",
      time: new Date().toISOString()
    });
  }, 5000);

  socket.on("disconnect", () => {
    console.log("Client disconnected: " + socket.id);
    clearInterval(interval);
  });
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
app.use("/previewEvent", previewEventRouter);
app.use('/carts', cartRouter);
app.use('/notificatons', notificationRouter);
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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(() => {
  socket.emit("ping");
}, 1000 * 60 * 5); // 5 phút


module.exports = app;
