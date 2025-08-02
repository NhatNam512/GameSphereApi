# 🔧 Environment Configuration for APK Socket.IO

## Production Environment Setup

### File: `.env`

```env
# ===============================================
# Socket.IO Configuration for APK Builds
# ===============================================

# Environment
NODE_ENV=production

# Server Configuration
PORT=3000
HOST=0.0.0.0

# ===============================================
# CORS Configuration for APK
# ===============================================
# ⚠️ QUAN TRỌNG: Để APK kết nối được
# Có thể để trống hoặc set '*' cho tất cả origins
# Trong production nên set cụ thể domain
ALLOWED_ORIGINS=*
# Hoặc cụ thể: 
# ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

# ===============================================
# Socket.IO APK Optimizations  
# ===============================================

# Socket Debug (set to 'true' để debug APK connections)
SOCKET_DEBUG=false

# Rate Limiting (set to 'false' để tắt rate limit cho APK testing)
RATE_LIMIT=true

# Timeout Settings cho APK (milliseconds)
SOCKET_PING_TIMEOUT=300000
SOCKET_PING_INTERVAL=45000
SOCKET_CONNECT_TIMEOUT=300000

# ===============================================
# Database Configuration
# ===============================================
DB_CONNECTION_STRING=mongodb://localhost:27017/your_db_name

# ===============================================
# SSL/HTTPS Configuration (cho production APK)
# ===============================================
# Nếu sử dụng HTTPS (recommended cho production APK)
# SSL_CERT_PATH=/path/to/certificate.crt
# SSL_KEY_PATH=/path/to/private.key

# ===============================================
# Mobile App Specific Settings
# ===============================================
# Set to true nếu muốn force binary data encoding cho APK
FORCE_BASE64=false

# Maximum reconnection attempts cho APK
MAX_RECONNECTION_ATTEMPTS=10

# APK Client Identification
MOBILE_CLIENT_HEADER=X-Client-Type
```

---

## 🚀 Deployment Commands

### Development với APK Testing:
```bash
# Bật debug cho APK
SOCKET_DEBUG=true npm start

# Tắt rate limiting cho testing
RATE_LIMIT=false npm start

# Combo cho APK development
SOCKET_DEBUG=true RATE_LIMIT=false ALLOWED_ORIGINS=* npm start
```

### Production:
```bash
# Production với HTTPS
NODE_ENV=production PORT=443 npm start

# Production với custom settings
NODE_ENV=production SOCKET_PING_TIMEOUT=300000 npm start
```

---

## 🔒 Network Security Configuration

### 1. Android Network Security Config

Tạo `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Development Configuration -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.1.100</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
    
    <!-- Production Configuration -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.yourdomain.com</domain>
    </domain-config>
    
    <!-- Base Config -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
```

### 2. Android Manifest Configuration

Trong `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:name=".MainApplication"
    android:networkSecurityConfig="@xml/network_security_config"
    android:usesCleartextTraffic="true"
    android:allowBackup="false"
    android:theme="@style/AppTheme">
    
    <!-- App activities -->
    
</application>

<!-- Permissions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
```

---

## 📊 Environment-based Socket Configuration

### Development Environment:
```javascript
// Mobile app config
const socketConfig = {
  url: 'http://192.168.1.100:3000', // Local IP
  options: {
    transports: ['polling', 'websocket'],
    timeout: 60000,
    forceNew: false,
    extraHeaders: {
      'X-Client-Type': 'mobile-app'
    }
  }
};
```

### Production Environment:
```javascript
// Mobile app config
const socketConfig = {
  url: 'https://api.yourdomain.com', // Production HTTPS
  options: {
    transports: ['polling', 'websocket'],
    timeout: 120000,
    reconnectionAttempts: 10,
    extraHeaders: {
      'X-Client-Type': 'mobile-app'
    }
  }
};
```

---

## 🛡️ Security Best Practices

### 1. CORS Security
```env
# Development
ALLOWED_ORIGINS=*

# Staging  
ALLOWED_ORIGINS=https://staging.yourdomain.com

# Production
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
```

### 2. Rate Limiting
```env
# Enable rate limiting in production
RATE_LIMIT=true

# Disable for APK testing
RATE_LIMIT=false
```

### 3. SSL/TLS Configuration
```env
# Production với SSL
SSL_ENABLED=true
SSL_CERT_PATH=/etc/ssl/certs/yourdomain.crt
SSL_KEY_PATH=/etc/ssl/private/yourdomain.key

# Let's Encrypt
LETSENCRYPT_DOMAIN=yourdomain.com
LETSENCRYPT_EMAIL=admin@yourdomain.com
```

---

## 🔍 Monitoring & Health Checks

### Environment Variables cho Monitoring:
```env
# Health check endpoints
HEALTH_CHECK_ENABLED=true
SOCKET_STATS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FILE_ENABLED=true
LOG_SOCKET_EVENTS=true

# APK specific monitoring
APK_CLIENT_TRACKING=true
MOBILE_METRICS_ENABLED=true
```

### Health Check URLs:
```bash
# Server health
GET /api/health

# Socket status
GET /api/socket/status

# Socket statistics
GET /api/socket/stats

# Mobile test
GET /api/socket/mobile-test
```

---

## 🚨 Troubleshooting Environment Issues

### 1. APK Connection Failed
```bash
# Check environment
echo $ALLOWED_ORIGINS
echo $SOCKET_DEBUG

# Test với debug
SOCKET_DEBUG=true ALLOWED_ORIGINS=* npm start
```

### 2. CORS Errors
```bash
# Tạm thời cho phép tất cả origins
ALLOWED_ORIGINS=* npm start

# Hoặc check logs
tail -f logs/combined.log | grep CORS
```

### 3. Timeout Issues
```bash
# Tăng timeout cho APK
SOCKET_PING_TIMEOUT=600000 SOCKET_CONNECT_TIMEOUT=600000 npm start
```

### 4. SSL Certificate Issues
```bash
# Check certificate
openssl x509 -in /path/to/cert.crt -text -noout

# Test SSL connection
openssl s_client -connect yourdomain.com:443
```

---

## 📱 Mobile App Environment Configuration

### React Native Config:
```javascript
// config/environment.js
const environment = {
  development: {
    SOCKET_URL: 'http://192.168.1.100:3000',
    API_URL: 'http://192.168.1.100:3000/api',
    SOCKET_DEBUG: true,
    TIMEOUT: 60000
  },
  production: {
    SOCKET_URL: 'https://api.yourdomain.com',
    API_URL: 'https://api.yourdomain.com/api', 
    SOCKET_DEBUG: false,
    TIMEOUT: 120000
  }
};

export default environment[__DEV__ ? 'development' : 'production'];
```

### Flutter Config:
```dart
// lib/config/environment.dart
class Environment {
  static const bool isProduction = bool.fromEnvironment('dart.vm.product');
  
  static String get socketUrl {
    return isProduction 
      ? 'https://api.yourdomain.com'
      : 'http://192.168.1.100:3000';
  }
  
  static Map<String, String> get extraHeaders {
    return {
      'X-Client-Type': 'mobile-app',
      'App-Version': '1.0.0'
    };
  }
}
```

---

## 🔄 Environment Migration

### Development → Production Checklist:
- [ ] Update SOCKET_URL trong mobile app
- [ ] Set NODE_ENV=production
- [ ] Configure ALLOWED_ORIGINS properly
- [ ] Enable SSL/HTTPS
- [ ] Set proper timeouts
- [ ] Enable rate limiting
- [ ] Disable debug logging
- [ ] Update Android network security config
- [ ] Test APK on real devices
- [ ] Monitor socket connections

### Rollback Plan:
```bash
# Quick rollback to development settings
NODE_ENV=development SOCKET_DEBUG=true ALLOWED_ORIGINS=* npm start
``` 