const { Server } = require("socket.io");

let io;

function initializeSocket(server) {
    io = new Server(server, {
        cors: { origin: "*" },
        transports: ["websocket", "polling"], // Hỗ trợ cả WebSocket và Polling
        pingInterval: 25000, // Khoảng thời gian gửi ping kiểm tra kết nối
        pingTimeout: 5000, // Thời gian timeout nếu client không phản hồi
        allowEIO3: true, // Hỗ trợ phiên bản cũ của Engine.io nếu cần
    });

    io.on("connection", (socket) => {
        console.log("Client kết nối:", socket.id);

        // Thêm nhiều log để debug
        socket.on("connect_error", (error) => {
            console.error("Socket kết nối lỗi:", error);
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

    return io;
}

function getSocketIO() {
    if (!io) {
        throw new Error("Socket.IO chưa được khởi tạo!");
    }
    return io;
}

module.exports = { initializeSocket, getSocketIO };
