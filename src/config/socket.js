/**
 * Socket.IO Configuration
 * Tối ưu cho mobile APK và production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const socketConfig = {
    // ✅ CORS Configuration
    cors: {
        origin: isDevelopment ? "*" : process.env.ALLOWED_ORIGINS?.split(',') || "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    },
    
    // ✅ Transport Configuration - Ưu tiên polling cho mobile
    transports: ["polling", "websocket"],
    
    // ✅ Connection Timeouts - Tăng cho mobile network
    pingTimeout: isDevelopment ? 60000 : 120000, // 2 phút cho production
    pingInterval: 25000, // 25 giây
    connectTimeout: isDevelopment ? 60000 : 120000,
    
    // ✅ Engine.IO Configuration
    allowEIO3: true, // Hỗ trợ phiên bản cũ
    allowUpgrades: true,
    
    // ✅ Compression Settings
    compression: true,
    httpCompression: {
        threshold: 1024,
        concurrency: 10,
        chunkSize: 1024
    },
    
    // ✅ Buffer Settings cho mobile
    maxHttpBufferSize: 1e6, // 1MB
    
    // ✅ Cleanup Settings
    cleanupEmptyChildNamespaces: true,
    
    // ✅ Custom Settings
    heartbeatInterval: isDevelopment ? 2 * 60 * 1000 : 5 * 60 * 1000, // 2 phút dev, 5 phút prod
    
    // ✅ Logging
    enableLogging: isDevelopment,
    
    // ✅ Room Settings
    maxRoomsPerSocket: 10,
    
    // ✅ Rate Limiting (có thể thêm sau)
    rateLimit: {
        enabled: !isDevelopment,
        maxEvents: 100, // events per minute
        windowMs: 60000 // 1 minute
    }
};

module.exports = socketConfig; 