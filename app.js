var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
var WebSocket = require('ws')

const mongoose = require('mongoose');
require("./models/userModel");
require("./models/gameModel");
require("./models/categoryModel");
require("./models/eventModel");
require("./models/orderModel");
require("./models/ticketModel");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var gamesRouter = require('./routes/games');
var categoriesRouter = require('./routes/categories');
var eventsRouter = require('./routes/events');
var ordersRouter = require('./routes/orders');
var ticketsRouter = require('./routes/tickets');

var app = express();
var http = require('http');
var server = http.createServer(app);
// var wss = new WebSocket.Server({ server });

// let clients = new Set();
// // Khi client kết nối WebSocket
// wss.on("connection", (ws) => {
//   console.log("🔗 Client connected");
//   clients.add(ws);

//   ws.on("message", (message) => {
//     console.log(`Received message => ${message}`);
//     // Xử lý message từ client
//   });

//   ws.on("close", () => {
//     console.log("❌ Client disconnected");
//     clients.delete(ws);
//   });
// });

// // Khởi động server HTTP
// server.listen(5000, () => {
//   console.log('Server is listening on port 5000');
// });

// clients.forEach(client => {
//   if (client.readyState === WebSocket.OPEN) {
//     client.send('Hello from server!');
//   }
// });

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
mongoose.connect('mongodb://localhost:27017/gamesphere')
  .then(() => console.log('>>>>>>>>>> DB Connected!!!!!!'))
  .catch(err => console.log('>>>>>>>>> DB Error: ', err));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/games', gamesRouter);
app.use('/categories', categoriesRouter);
app.use('/events', eventsRouter);
app.use('/orders', ordersRouter);
app.use('/tickets', ticketsRouter);
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
