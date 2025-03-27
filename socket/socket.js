const { Server } = require("socket.io");

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // Hoặc chỉ định domain frontend
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client đã kết nối:", socket.id);

    socket.on("sendMessage", (data) => {
      console.log("Tin nhắn nhận được:", data);
      io.emit("receiveMessage", data);
    });

    socket.on("disconnect", () => {
      console.log("Client đã ngắt kết nối:", socket.id);
    });
  });

  return io;
}

module.exports = { initializeSocket };
