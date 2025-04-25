const { Server } = require("socket.io");

let io;
let heartbeatInterval;

function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ["websocket", "polling"], // Hỗ trợ cả WebSocket và Polling

    });

    io.on("connection", (socket) => {
        console.log("Client kết nối:", socket.id);

        // Thêm nhiều log để debug
        socket.on("connect_error", (error) => {
            console.error("Socket kết nối lỗi:", error);
        });

        // ✅ Nhận userId từ phía client và join vào room
        socket.on("joinRoom", (userId) => {
            socket.join(userId); // Mỗi user là một room riêng
            console.log(`🔗 User ${userId} đã join room riêng.`);
        });

        socket.on("disconnect", (reason) => {
            console.log("Client ngắt kết nối:", socket.id, "Lý do:", reason);
        });

        // Ví dụ về việc bắt và log các sự kiện khác
        socket.on("error", (error) => {
            console.error("Lỗi socket:", error);
        });
    });

    // Thêm log toàn cục cho kết nối
    io.engine.on("connection_error", (err) => {
        console.log("Lỗi kết nối socket toàn cục:", err.message);
        console.log("Mã lỗi:", err.code);
        console.log("Chi tiết lỗi:", err);
    });

    // Bắt đầu gửi tin nhắn định kỳ sau khi socket được khởi tạo
    startPeriodicMessage();

    return io;
}

function getSocketIO() {
    if (!io) {
        throw new Error("Socket.IO chưa được khởi tạo!");
    }
    return io;
}

// Hàm gửi tin nhắn định kỳ mỗi 5 phút
function startPeriodicMessage() {
    // Xóa interval cũ nếu có
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Tạo interval mới
    heartbeatInterval = setInterval(() => {
        if (!io) return; // Đảm bảo io đã được khởi tạo

        const currentTime = new Date().toLocaleString();
        const message = {
            type: 'periodic',
            content: `Tin nhắn định kỳ - ${currentTime}`,
            timestamp: Date.now()
        };

        // Gửi tin nhắn đến tất cả client
        io.emit('periodicMessage', message);
        console.log(`📨 Đã gửi tin nhắn định kỳ đến tất cả client - ${currentTime}`);
    }, 5 * 60 * 1000); // 5 phút = 5 * 60 * 1000 milliseconds
}

module.exports = { initializeSocket, getSocketIO };