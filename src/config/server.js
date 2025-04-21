require('dotenv').config();

const serverConfig = {
    // Cấu hình port cho server
    port: process.env.PORT || 3000,

    // Cấu hình môi trường
    env: process.env.NODE_ENV || 'development',

    // Cấu hình cors
    corsOptions: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
    },

    // Cấu hình Redis
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        keyPrefix: 'gamesphere:',
        connectTimeout: 10000,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
    },

    // Cấu hình MongoDB
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb+srv://namnnps38713:wcVNA8PAeuqTioxq@namnnps38713.bctmi.mongodb.net/gamesphere'
    },

    // Cấu hình JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    },

    firebase: {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET
    }
};

module.exports = serverConfig;
