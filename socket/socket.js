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
        
        // ✅ Lưu thông tin client để debug - Thêm thông tin cho thiết bị thật
        socket.clientInfo = {
            connectedAt: new Date(),
            transport: socket.conn.transport.name,
            userAgent: socket.handshake.headers['user-agent'],
            clientIP: socket.handshake.address,
            origin: socket.handshake.headers.origin,
            referer: socket.handshake.headers.referer
        };
        
        // ✅ Log chi tiết cho debug thiết bị thật
        console.log(`📱 Client Details:`, {
            id: socket.id,
            transport: socket.conn.transport.name,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
            origin: socket.handshake.headers.origin
        });

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

        // ✅ Enhanced error handling - Thêm logs chi tiết cho mobile
        socket.on("connect_error", (error) => {
            console.error(`❌ Socket connection error [${socket.id}]:`, {
                message: error.message,
                type: error.type,
                description: error.description,
                context: error.context,
                clientInfo: socket.clientInfo
            });
        });

        socket.on("error", (error) => {
            console.error(`❌ Socket error [${socket.id}]:`, {
                message: error.message,
                stack: error.stack,
                clientInfo: socket.clientInfo
            });
        });
        
        // ✅ Thêm handler cho mobile network issues
        socket.on("reconnect_attempt", (attemptNumber) => {
            console.log(`🔄 Socket ${socket.id} attempting reconnect #${attemptNumber}`);
        });
        
        socket.on("reconnect", (attemptNumber) => {
            console.log(`✅ Socket ${socket.id} reconnected after ${attemptNumber} attempts`);
        });
        
        socket.on("reconnect_error", (error) => {
            console.error(`❌ Socket ${socket.id} reconnect error:`, error.message);
        });
        
        socket.on("reconnect_failed", () => {
            console.error(`❌ Socket ${socket.id} failed to reconnect`);
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

    // ✅ Enhanced global connection error handling cho thiết bị thật
    io.engine.on("connection_error", (err) => {
        console.error("🚨 Global Socket Connection Error:", {
            message: err.message,
            code: err.code,
            type: err.type,
            req: {
                url: err.req?.url,
                headers: {
                    userAgent: err.req?.headers?.['user-agent'],
                    origin: err.req?.headers?.origin,
                    referer: err.req?.headers?.referer
                },
                method: err.req?.method,
                ip: err.req?.connection?.remoteAddress
            },
            context: err.context,
            description: err.description
        });
    });
    
    // ✅ Thêm middleware để log tất cả connections attempts
    io.use((socket, next) => {
        console.log(`🔍 Connection attempt from:`, {
            id: socket.id,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
            origin: socket.handshake.headers.origin,
            transport: socket.conn.transport.name,
            timestamp: new Date().toISOString()
        });
        next();
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