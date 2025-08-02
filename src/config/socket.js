/**
 * Socket.IO Configuration
 * Tối ưu cho mobile APK và production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const socketConfig = {
    // ✅ CORS Configuration - Enhanced cho APK builds
    cors: {
        origin: function (origin, callback) {
            // ✅ Cho phép requests không có origin (mobile apps, APK builds)
            if (!origin) return callback(null, true);
            
            if (isDevelopment) {
                // Development: cho phép tất cả
                return callback(null, true);
            } else {
                // Production: kiểm tra allowed origins
                const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
                // ✅ Nếu không có ALLOWED_ORIGINS, cho phép tất cả (cho APK)
                if (allowedOrigins.length === 0) {
                    console.log('🔓 No ALLOWED_ORIGINS set, allowing all origins for APK support');
                    return callback(null, true);
                }
                if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                    return callback(null, true);
                } else {
                    console.log(`❌ Origin blocked by CORS: ${origin}`);
                    return callback(new Error('Not allowed by CORS'));
                }
            }
        },
        methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        credentials: true,
        allowedHeaders: [
            "Content-Type", 
            "Authorization", 
            "X-Requested-With",
            "Accept",
            "Origin",
            "Access-Control-Request-Method",
            "Access-Control-Request-Headers"
        ],
        exposedHeaders: ["X-Socket-ID"],
        optionsSuccessStatus: 200
    },
    
    // ✅ Transport Configuration - Tối ưu cho APK/mobile
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    upgradeTimeout: isDevelopment ? 10000 : 30000,
    
    // ✅ Connection Timeouts - Tăng cho APK builds và mobile networks kém
    pingTimeout: isDevelopment ? 60000 : 300000, // 5 phút cho production APK
    pingInterval: isDevelopment ? 25000 : 45000, // 45 giây cho production
    connectTimeout: isDevelopment ? 45000 : 300000, // 5 phút cho APK
    
    // ✅ Engine.IO Configuration - Hỗ trợ đa phiên bản
    allowEIO3: true,
    allowEIO4: true,
    
    // ✅ Compression Settings - Tối ưu cho mobile data
    compression: true,
    httpCompression: {
        threshold: 512, // Nhỏ hơn cho mobile
        concurrency: 5, // Giảm cho mobile
        chunkSize: 512
    },
    
    // ✅ Buffer Settings cho mobile/APK
    maxHttpBufferSize: 2e6, // 2MB cho APK
    
    // ✅ Cleanup Settings
    cleanupEmptyChildNamespaces: true,
    
    // ✅ Custom Settings cho APK
    heartbeatInterval: isDevelopment ? 2 * 60 * 1000 : 3 * 60 * 1000, // 3 phút cho APK
    
    // ✅ Logging - Enhanced cho debug APK
    enableLogging: isDevelopment || process.env.SOCKET_DEBUG === 'true',
    
    // ✅ Room Settings
    maxRoomsPerSocket: 20, // Tăng cho mobile apps
    
    // ✅ Rate Limiting - Nới lỏng cho APK
    rateLimit: {
        enabled: !isDevelopment && process.env.RATE_LIMIT !== 'false',
        maxEvents: 200, // Tăng cho mobile apps
        windowMs: 60000
    },
    
    // ✅ APK/Mobile specific settings
    forceNew: false,
    rememberUpgrade: false,
    timeout: isDevelopment ? 20000 : 120000, // 2 phút cho APK
    
    // ✅ Polling settings - Critical cho APK
    polling: {
        extraHeaders: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Client-Type': 'mobile-app'
        }
    },
    
    // ✅ APK Connection Recovery
    reconnection: true,
    reconnectionAttempts: isDevelopment ? 5 : 10, // Nhiều hơn cho APK
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    
    // ✅ Mobile Network Handling
    autoConnect: true,
    forceBase64: false, // Set true nếu APK có vấn đề với binary
    
    // ✅ Server binding - Quan trọng cho APK access
    serveClient: false, // Disable client serving cho performance
    
    // ✅ Thêm settings cho Android Network Security
    allowRequest: (req, callback) => {
        // Log incoming requests cho debug APK
        if (socketConfig.enableLogging) {
            console.log('🔍 Socket connection request:', {
                origin: req.headers.origin,
                userAgent: req.headers['user-agent'],
                ip: req.connection.remoteAddress,
                transport: req._query?.transport
            });
        }
        callback(null, true);
    }
};

// ✅ Environment-specific overrides cho APK
if (process.env.NODE_ENV === 'production') {
    // Production APK settings
    console.log('🚀 Production Socket.IO config loaded for APK support');
    
    // Override với settings từ environment
    if (process.env.SOCKET_PING_TIMEOUT) {
        socketConfig.pingTimeout = parseInt(process.env.SOCKET_PING_TIMEOUT);
    }
    if (process.env.SOCKET_PING_INTERVAL) {
        socketConfig.pingInterval = parseInt(process.env.SOCKET_PING_INTERVAL);
    }
    if (process.env.SOCKET_CONNECT_TIMEOUT) {
        socketConfig.connectTimeout = parseInt(process.env.SOCKET_CONNECT_TIMEOUT);
    }
}

module.exports = socketConfig; 