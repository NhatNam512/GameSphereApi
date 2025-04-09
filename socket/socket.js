const { Server } = require("socket.io");

let io;

function initializeSocket(server) {
    io = new Server(server, {
        cors: { origin: "*" }
    });

    io.on("connection", (socket) => {
        console.log("Client kết nối:", socket.id);
        socket.on("message", (data) => {
            console.log(`Tin nhắn từ ${socket.id}:`, data);
            
            // Gửi tin nhắn cho tất cả clients khác
            socket.broadcast.emit("message", data);
            
            // Hoặc có thể xử lý và phản hồi cho client gửi
            // socket.emit("message", `Server đã nhận: ${data}`);
        });
        socket.on("disconnect", () => {
            console.log("Client ngắt kết nối:", socket.id);
        });
    });

    return io;
}

function getSocketIO() {
    if (!io) {
        throw new Error("Socket.IO chưa được khởi tạo!");
    }
    return io;
}

// Hàm gửi tin nhắn tới tất cả clients
function broadcastMessage(event, data) {
    if (!io) {
        throw new Error("Socket.IO chưa được khởi tạo!");
    }
    io.emit(event, data);
}

// Hàm gửi tin nhắn tới một client cụ thể
function sendToClient(socketId, event, data) {
    if (!io) {
        throw new Error("Socket.IO chưa được khởi tạo!");
    }
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
        socket.emit(event, data);
    }
}

module.exports = { 
    initializeSocket, 
    getSocketIO,
    broadcastMessage,
    sendToClient
};
