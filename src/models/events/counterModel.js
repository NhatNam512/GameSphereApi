const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 100000 }
});

module.exports = mongoose.model('counters', counterSchema);