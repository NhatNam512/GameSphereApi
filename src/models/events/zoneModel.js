const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const zoneSchema = new schema({
    name: {type: String, required: true},
    layout: {
        rows: {type: Number},
        cols: {type: Number},
        seats: [
            {
                seatId: {type: String},
                row: {type: Number},
                col: {type: Number},
                label: {type: String},
                price: {type: Number},
                area: {type: String},
                color: {type: String},
            }
        ]
    },
    eventId: {type: oid, ref: 'events', required: true},
    createdBy: {type: oid, ref: 'users'},
    updatedBy: {type: oid, ref: 'users'},
}, {timestamps: true});

const zoneModel = mongoose.model('zones', zoneSchema);

module.exports = zoneModel;