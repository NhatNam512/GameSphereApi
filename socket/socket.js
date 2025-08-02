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

    // ✅ Log cấu hình cho APK debugging
    console.log('🚀 Socket.IO Server Starting with APK Support:', {
        environment: process.env.NODE_ENV || 'development',
        transports: config.transports,
        pingTimeout: config.pingTimeout,
        pingInterval: config.pingInterval,
        connectTimeout: config.connectTimeout,
        corsOrigin: typeof config.cors.origin === 'function' ? 'Dynamic CORS' : config.cors.origin
    });

    io.on("connection", (socket) => {
        console.log(`🔗 Client kết nối: ${socket.id} | Transport: ${socket.conn.transport.name}`);
        
        // ✅ Enhanced client info cho APK debugging
        socket.clientInfo = {
            connectedAt: new Date(),
            transport: socket.conn.transport.name,
            userAgent: socket.handshake.headers['user-agent'],
            clientIP: socket.handshake.address,
            origin: socket.handshake.headers.origin,
            referer: socket.handshake.headers.referer,
            // ✅ Detect mobile/APK clients
            isMobile: /mobile|android|iphone|ipad/i.test(socket.handshake.headers['user-agent'] || ''),
            isAPK: !socket.handshake.headers.origin || socket.handshake.headers['x-client-type'] === 'mobile-app'
        };
        
        // ✅ Enhanced logging cho APK debugging
        console.log(`📱 Client Details:`, {
            id: socket.id,
            transport: socket.conn.transport.name,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
            origin: socket.handshake.headers.origin || 'No Origin (Possible APK)',
            isMobile: socket.clientInfo.isMobile,
            isAPK: socket.clientInfo.isAPK,
            clientType: socket.handshake.headers['x-client-type'] || 'unknown'
        });

        // ✅ APK-specific connection success event
        if (socket.clientInfo.isAPK) {
            console.log(`📱 APK Client Connected: ${socket.id}`);
            socket.emit('apkConnectionConfirmed', {
                socketId: socket.id,
                serverTime: new Date().toISOString(),
                message: 'APK successfully connected to Socket.IO server'
            });
        }

        // ✅ Xử lý transport upgrade với APK logging
        socket.conn.on('upgrade', () => {
            console.log(`🔄 ${socket.id} upgraded to ${socket.conn.transport.name}`);
            if (socket.clientInfo.isAPK) {
                console.log(`📱 APK ${socket.id} transport upgraded successfully`);
            }
        });

        // ✅ Nhận userId từ phía client và join vào room
        socket.on("joinRoom", (userId) => {
            socket.userId = userId;
            socket.join(userId); // User room
            console.log(`👤 User ${userId} joined personal room | Socket: ${socket.id} | Client: ${socket.clientInfo.isAPK ? 'APK' : 'Web'}`);
        });

        // ✅ Join group room để nhận location updates
        socket.on("joinGroup", (groupId) => {
            if (!groupId) return;
            socket.join(`group_${groupId}`);
            console.log(`👥 Socket ${socket.id} joined group_${groupId} | Client: ${socket.clientInfo.isAPK ? 'APK' : 'Web'}`);
        });

        // ✅ Leave group room
        socket.on("leaveGroup", (groupId) => {
            if (!groupId) return;
            socket.leave(`group_${groupId}`);
            console.log(`👥 Socket ${socket.id} left group_${groupId}`);
        });

        // ✅ Enhanced heartbeat cho APK - client gửi ping
        socket.on("ping", (callback) => {
            const timestamp = Date.now();
            if (typeof callback === 'function') {
                callback({
                    pong: 'pong',
                    serverTime: timestamp,
                    clientType: socket.clientInfo.isAPK ? 'APK' : 'Web'
                });
            }
            
            // Log ping từ APK clients
            if (socket.clientInfo.isAPK && socketConfig.enableLogging) {
                console.log(`💓 APK Ping received from ${socket.id}`);
            }
        });

        // ✅ APK Connection Test - để APK kiểm tra kết nối
        socket.on("apkConnectionTest", (data, callback) => {
            console.log(`🧪 APK Connection Test from ${socket.id}:`, data);
            if (typeof callback === 'function') {
                callback({
                    status: 'success',
                    socketId: socket.id,
                    serverTime: Date.now(),
                    message: 'APK connection test successful',
                    received: data,
                    transport: socket.conn.transport.name
                });
            }
        });

        // ✅ Enhanced error handling cho APK
        socket.on("connect_error", (error) => {
            console.error(`❌ Socket connection error [${socket.id}] ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'}:`, {
                message: error.message,
                type: error.type,
                description: error.description,
                context: error.context,
                clientInfo: socket.clientInfo
            });
        });

        socket.on("error", (error) => {
            console.error(`❌ Socket error [${socket.id}] ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'}:`, {
                message: error.message,
                stack: error.stack,
                clientInfo: socket.clientInfo
            });
        });
        
        // ✅ Enhanced mobile network issues handling
        socket.on("reconnect_attempt", (attemptNumber) => {
            console.log(`🔄 Socket ${socket.id} ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'} attempting reconnect #${attemptNumber}`);
        });
        
        socket.on("reconnect", (attemptNumber) => {
            console.log(`✅ Socket ${socket.id} ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'} reconnected after ${attemptNumber} attempts`);
            
            // Gửi thông báo reconnect thành công cho APK
            if (socket.clientInfo.isAPK) {
                socket.emit('apkReconnected', {
                    socketId: socket.id,
                    attempts: attemptNumber,
                    serverTime: new Date().toISOString()
                });
            }
        });
        
        socket.on("reconnect_error", (error) => {
            console.error(`❌ Socket ${socket.id} ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'} reconnect error:`, error.message);
        });
        
        socket.on("reconnect_failed", () => {
            console.error(`❌ Socket ${socket.id} ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'} failed to reconnect`);
        });

        socket.on("disconnect", (reason) => {
            const duration = socket.clientInfo ? 
                Math.round((Date.now() - socket.clientInfo.connectedAt.getTime()) / 1000) : 0;
            console.log(`🔌 Client disconnected: ${socket.id} ${socket.clientInfo.isAPK ? '[APK]' : '[WEB]'} | Reason: ${reason} | Duration: ${duration}s`);
        });

        // ✅ Enhanced test connection cho APK
        socket.on("testConnection", (data, callback) => {
            if (typeof callback === 'function') {
                callback({
                    status: 'ok',
                    socketId: socket.id,
                    timestamp: Date.now(),
                    received: data,
                    clientType: socket.clientInfo.isAPK ? 'APK' : 'Web',
                    transport: socket.conn.transport.name,
                    serverEnvironment: process.env.NODE_ENV || 'development'
                });
            }
        });
    });

    // ✅ Enhanced global connection error handling cho APK
    io.engine.on("connection_error", (err) => {
        console.error("🚨 Global Socket Connection Error:", {
            message: err.message,
            code: err.code,
            type: err.type,
            req: {
                url: err.req?.url,
                headers: {
                    userAgent: err.req?.headers?.['user-agent'],
                    origin: err.req?.headers?.origin || 'No Origin (Possible APK)',
                    referer: err.req?.headers?.referer,
                    clientType: err.req?.headers?.['x-client-type']
                },
                method: err.req?.method,
                ip: err.req?.connection?.remoteAddress
            },
            context: err.context,
            description: err.description,
            isPossibleAPK: !err.req?.headers?.origin
        });
    });
    
    // ✅ Enhanced middleware cho APK connection logging
    io.use((socket, next) => {
        const isAPK = !socket.handshake.headers.origin || socket.handshake.headers['x-client-type'] === 'mobile-app';
        const isMobile = /mobile|android|iphone|ipad/i.test(socket.handshake.headers['user-agent'] || '');
        
        console.log(`🔍 Connection attempt ${isAPK ? '[APK]' : '[WEB]'}:`, {
            id: socket.id,
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent'],
            origin: socket.handshake.headers.origin || 'No Origin (APK)',
            transport: socket.conn.transport.name,
            timestamp: new Date().toISOString(),
            isAPK,
            isMobile,
            clientType: socket.handshake.headers['x-client-type'] || 'unknown'
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

// ✅ Enhanced heartbeat system cho APK
function startPeriodicMessage() {
    // Xóa interval cũ nếu có
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // Tạo interval mới - tối ưu cho APK
    heartbeatInterval = setInterval(() => {
        if (!io) return;

        const connectedClients = io.engine.clientsCount;
        if (connectedClients === 0) return; // Không gửi nếu không có client

        const currentTime = new Date().toLocaleString();
        const heartbeat = {
            type: 'heartbeat',
            serverTime: currentTime,
            timestamp: Date.now(),
            connectedClients: connectedClients,
            environment: process.env.NODE_ENV || 'development'
        };

        // Enhanced heartbeat cho APK clients
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