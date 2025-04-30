const mongoose = require("mongoose");
const schema = mongoose.Schema;
const oid = schema.ObjectId;

const friendRequestSchema = new schema({
    id: { type: oid },
    senderId: { type: oid, ref: "users" },
    receiverId: { type: oid, ref: "users" },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
}, {
    timestamps: true,
    indexes: [
        { fields: { senderId: 1, receiverId: 1 }, unique: true } // Đảm bảo mỗi cặp senderId và receiverId là duy nhất
    ]
})
friendRequestSchema.index({ senderId: 1, receiverId: 1 });
friendRequestSchema.index({ receiverId: 1, status: 1 }); // Lấy danh sách lời mời chờ
friendRequestSchema.index({ senderId: 1 });              // Truy vấn lời mời đã gửi
friendRequestSchema.index({ status: 1, updatedAt: 1 });  // Phục vụ phân tích/gợi ý
module.exports = mongoose.models.friend_requests || mongoose.model("friend_requests", friendRequestSchema);
