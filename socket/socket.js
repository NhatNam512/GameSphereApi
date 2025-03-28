const { Server } = require("socket.io");

let io;

function initializeSocket(server) {
    io = new Server(server, {
        cors: { origin: "*" }
    });

    io.on("connection", (socket) => {
        console.log("Client kết nối:", socket.id);

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

module.exports = { initializeSocket, getSocketIO };
