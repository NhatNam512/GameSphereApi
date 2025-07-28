const { Server } = require("socket.io");
const socketConfig = require("../src/config/socket");

let io;
let heartbeatInterval;

function initializeSocket(server) {
    // ✅ Sử dụng config từ file riêng
    const config = { ...socketConfig };
    delete config.heartbeatInterval; // Remove custom properties
    delete config.enableLogging;
    delete config.maxRoomsPerSocket;
    delete config.rateLimit;
    
    io = new Server(server, config);

    io.on("connection", (socket) => {
        console.log(`🔗 Client kết nối: ${socket.id} | Transport: ${socket.conn.transport.name}`);
        
        // ✅ Lưu thông tin client để debug
        socket.clientInfo = {
            connectedAt: new Date(),
            transport: socket.conn.transport.name,
            userAgent: socket.handshake.headers['user-agent']
        };

        // ✅ Xử lý transport upgrade
        socket.conn.on('upgrade', () => {
            console.log(`🔄 ${socket.id} upgraded to ${socket.conn.transport.name}`);
        });

        // ✅ Nhận userId từ phía client và join vào room
        socket.on("joinRoom", (userId) => {
            socket.userId = userId;
            socket.join(userId); // User room
            console.log(`👤 User ${userId} joined personal room | Socket: ${socket.id}`);
        });

        // ✅ Join group room để nhận location updates
        socket.on("joinGroup", (groupId) => {
            if (!groupId) return;
            socket.join(`group_${groupId}`);
            console.log(`👥 Socket ${socket.id} joined group_${groupId}`);
        });

        // ✅ Leave group room
        socket.on("leaveGroup", (groupId) => {
            if (!groupId) return;
            socket.leave(`group_${groupId}`);
            console.log(`👥 Socket ${socket.id} left group_${groupId}`);
        });

        // ✅ Heartbeat cho mobile - client gửi ping
        socket.on("ping", (callback) => {
            if (typeof callback === 'function') {
                callback('pong');
            }
        });

        // ✅ Enhanced error handling
        socket.on("connect_error", (error) => {
            console.error(`❌ Socket connection error [${socket.id}]:`, error.message);
        });

        socket.on("error", (error) => {
            console.error(`❌ Socket error [${socket.id}]:`, error.message);
        });

        socket.on("disconnect", (reason) => {
            const duration = socket.clientInfo ? 
                Math.round((Date.now() - socket.clientInfo.connectedAt.getTime()) / 1000) : 0;
            console.log(`🔌 Client disconnected: ${socket.id} | Reason: ${reason} | Duration: ${duration}s`);
        });

        // ✅ Test connection - để client kiểm tra kết nối
        socket.on("testConnection", (data, callback) => {
            if (typeof callback === 'function') {
                callback({
                    status: 'ok',
                    socketId: socket.id,
                    timestamp: Date.now(),
                    received: data
                });
            }
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

// ✅ Heartbeat system tối ưu cho mobile
function startPeriodicMessage() {
    // Xóa interval cũ nếu có
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Tạo interval mới - giảm xuống 2 phút cho mobile
    heartbeatInterval = setInterval(() => {
        if (!io) return;

        const connectedClients = io.engine.clientsCount;
        if (connectedClients === 0) return; // Không gửi nếu không có client

        const currentTime = new Date().toLocaleString();
        const heartbeat = {
            type: 'heartbeat',
            serverTime: currentTime,
            timestamp: Date.now(),
            connectedClients: connectedClients
        };

        // Chỉ gửi heartbeat, không gửi message không cần thiết
        io.emit('serverHeartbeat', heartbeat);
        if (socketConfig.enableLogging) {
            console.log(`💓 Server heartbeat sent to ${connectedClients} clients - ${currentTime}`);
        }
    }, socketConfig.heartbeatInterval);
}

// ✅ Thêm các utility functions
function getConnectionStats() {
    if (!io) return null;
    
    return {
        totalConnections: io.engine.clientsCount,
        connectedSockets: Array.from(io.sockets.sockets.keys()),
        rooms: Array.from(io.sockets.adapter.rooms.keys()),
        timestamp: Date.now()
    };
}

// ✅ Broadcast to specific room với error handling
function broadcastToRoom(roomId, event, data) {
    if (!io) {
        console.error('❌ Socket.IO not initialized');
        return false;
    }
    
    try {
        io.to(roomId).emit(event, data);
        console.log(`📡 Broadcasted '${event}' to room '${roomId}'`);
        return true;
    } catch (error) {
        console.error(`❌ Error broadcasting to room ${roomId}:`, error.message);
        return false;
    }
}

// ✅ Cleanup function khi server shutdown
function cleanup() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    if (io) {
        io.close();
        console.log('🔌 Socket.IO server closed');
    }
}

// ✅ Graceful shutdown handling
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

module.exports = { 
    initializeSocket, 
    getSocketIO, 
    getConnectionStats, 
    broadcastToRoom, 
    cleanup 
};