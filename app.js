var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const cors = require('cors');

const mongoose = require('mongoose');
require("./models/userModel");
require("./models/gameModel");
require("./models/categoryModel");
require("./models/eventModel");


var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var gamesRouter = require('./routes/games');
var categoriesRouter = require('./routes/categories');
var eventsRouter = require('./routes/events');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//connect database
mongoose.connect('mongodb+srv://namnnps38713:wcVNA8PAeuqTioxq@namnnps38713.bctmi.mongodb.net/gamesphere')
  .then(() => console.log('>>>>>>>>>> DB Connected!!!!!!'))
  .catch(err => console.log('>>>>>>>>> DB Error: ', err));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/games', gamesRouter);
app.use('/categories', categoriesRouter);
app.use('/events', eventsRouter);
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

// Sử dụng middleware CORS
app.use(cors({
  origin: 'http://localhost:3000' // Cho phép yêu cầu từ miền này
}));

// Các route khác của bạn
app.get('/categories/all', (req, res) => {
  // Trả về dữ liệu
});

// Khởi động máy chủ
app.listen(30000, () => {
  console.log('Server is running on port 30000');
});

module.exports = app;
