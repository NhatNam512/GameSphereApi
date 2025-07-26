const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;
const order = new schema({
    id: {type: oid},
    eventId: {type: oid, ref: "events"},
    userId: {type: oid, ref: "users"},
    amount: {type: Number},
    totalPrice: {type: Number},
    showtimeId: {type: oid, ref: "showtimes"},
    status: {type: String, enum: ["pending", "paid", "failed", "cancelled"], default: "pending"},
    bookingIds: [{ type: oid }],
    bookingType: {type: String, enum: ["seat", "zone", "none"], default: "none"},
    createdAt: { type: Date, default: Date.now },
    // Thêm các field mới để hỗ trợ quản lý hủy đơn
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    expiresAt: { 
        type: Date, 
        default: function() { 
            return new Date(Date.now() + 10 * 60 * 1000); // 10 phút từ khi tạo
        }
    },
    paidAt: { type: Date },
    updatedAt: { type: Date, default: Date.now }
});

// Tự động cập nhật updatedAt khi có thay đổi
order.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Index để tăng hiệu suất query cho cleanup job
order.index({ status: 1, createdAt: 1 });
order.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.models.order || mongoose.model("order", order);