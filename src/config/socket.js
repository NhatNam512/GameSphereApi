/**
 * Socket.IO Configuration
 * Tối ưu cho mobile APK và production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const socketConfig = {
    // ✅ CORS Configuration - Sửa để hỗ trợ thiết bị thật tốt hơn
    cors: {
        origin: function (origin, callback) {
            // Cho phép requests không có origin (mobile apps)
            if (!origin) return callback(null, true);
            
            if (isDevelopment) {
                // Development: cho phép tất cả
                return callback(null, true);
            } else {
                // Production: kiểm tra allowed origins
                const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
                if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
                    return callback(null, true);
                } else {
                    return callback(new Error('Not allowed by CORS'));
                }
            }
        },
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        optionsSuccessStatus: 200 // Một số legacy browsers (IE11, various SmartTVs) choke on 204
    },
    
    // ✅ Transport Configuration - Ưu tiên polling cho mobile (quan trọng cho thiết bị thật)
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    upgradeTimeout: 30000, // Tăng thời gian upgrade
    
    // ✅ Connection Timeouts - Tăng thời gian chờ cho mobile network kém
    pingTimeout: isDevelopment ? 60000 : 180000, // 3 phút cho production (thiết bị thật)
    pingInterval: isDevelopment ? 25000 : 30000, // 30 giây cho production
    connectTimeout: isDevelopment ? 60000 : 180000, // 3 phút
    
    // ✅ Engine.IO Configuration
    allowEIO3: true, // Hỗ trợ phiên bản cũ
    
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
    
    // ✅ Rate Limiting (tắt trong development để debug dễ hơn)
    rateLimit: {
        enabled: !isDevelopment,
        maxEvents: 100, // events per minute
        windowMs: 60000 // 1 minute
    },
    
    // ✅ Thêm settings cho mobile networks
    forceNew: false, // Tái sử dụng connection
    rememberUpgrade: false, // Không nhớ upgrade cho mobile
    timeout: isDevelopment ? 20000 : 60000, // 1 phút timeout cho production
    
    // ✅ Polling settings cho mobile
    polling: {
        extraHeaders: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    }
};

module.exports = socketConfig; 