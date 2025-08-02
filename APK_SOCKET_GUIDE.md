# 📱 APK Socket.IO Connection Guide

## Hướng dẫn khắc phục vấn đề Socket.IO khi build APK

### 🔍 Vấn đề thường gặp với APK builds

1. **APK không thể kết nối Socket.IO** 
2. **Connection timeout khi chạy trên thiết bị thật**
3. **CORS errors với mobile app**
4. **Transport không upgrade được**

---

## ✅ Giải pháp đã được implement

### 1. **Cấu hình Socket.IO cho APK** (✅ Hoàn thành)

File `src/config/socket.js` đã được tối ưu:
- CORS cho phép requests không có origin (APK)
- Timeout tăng lên cho mobile networks
- Transport ưu tiên polling trước websocket
- Compression tối ưu cho mobile data
- Reconnection settings cho APK

### 2. **Enhanced Logging cho APK Debug** (✅ Hoàn thành)

File `socket/socket.js` đã được update:
- Detect APK clients tự động
- Log chi tiết cho APK connections
- Special events cho APK debugging
- Enhanced error handling

---

## 🔧 Cấu hình Environment

### File `.env` cần thiết:

```env
# Environment
NODE_ENV=production

# Socket Configuration cho APK
SOCKET_DEBUG=true
RATE_LIMIT=false

# CORS cho APK (important!)
ALLOWED_ORIGINS=*

# Timeout settings cho APK
SOCKET_PING_TIMEOUT=300000
SOCKET_PING_INTERVAL=45000
SOCKET_CONNECT_TIMEOUT=300000
```

### Chạy server với debug:
```bash
# Enable socket debugging
SOCKET_DEBUG=true npm start

# Disable rate limiting cho testing
RATE_LIMIT=false npm start
```

---

## 📱 Client-side (Mobile App) Configuration

### 1. **Socket.IO Client Setup for APK**

```javascript
import io from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  // ✅ Transport configuration cho APK
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: false,
  
  // ✅ Timeout cho mobile networks
  timeout: 120000,
  forceNew: false,
  
  // ✅ Reconnection cho APK
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  
  // ✅ Headers cho APK identification
  extraHeaders: {
    'X-Client-Type': 'mobile-app'
  },
  
  // ✅ Query params
  query: {
    clientType: 'apk'
  }
});
```

### 2. **APK Connection Testing**

```javascript
// Test kết nối APK
socket.emit('apkConnectionTest', {
  message: 'Testing APK connection',
  timestamp: Date.now(),
  appVersion: '1.0.0'
}, (response) => {
  console.log('APK Connection Test Response:', response);
});

// Listen for APK confirmation
socket.on('apkConnectionConfirmed', (data) => {
  console.log('APK Connected:', data);
});

// Enhanced ping for APK
socket.emit('ping', (response) => {
  console.log('APK Ping Response:', response);
});
```

---

## 🚀 Production Deployment cho APK

### 1. **Server URL Configuration**

```javascript
// Environment-based server URL
const getServerUrl = () => {
  if (__DEV__) {
    return 'http://192.168.1.100:3000'; // Local IP for development
  } else {
    return 'https://api.yourdomain.com'; // Production HTTPS
  }
};
```

### 2. **Android Network Security Config**

Tạo file `android/app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <!-- Development -->
        <domain includeSubdomains="true">192.168.1.100</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
        
        <!-- Production - nếu dùng HTTP -->
        <domain includeSubdomains="true">yourdomain.com</domain>
    </domain-config>
</network-security-config>
```

Thêm vào `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

### 3. **Android Permissions**

Trong `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## 🔍 Debugging APK Socket Issues

### 1. **Server-side Debug Commands**

```bash
# Bật debug logging
SOCKET_DEBUG=true npm start

# Check socket connections
curl -X GET http://localhost:3000/api/socket/stats

# Monitor logs
tail -f logs/combined.log | grep "APK"
```

### 2. **Client-side Debug**

```javascript
// Connection monitoring
socket.on('connect', () => {
  console.log('✅ APK Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ APK Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.log('❌ APK Connection Error:', error);
});

// Server heartbeat monitoring
socket.on('serverHeartbeat', (data) => {
  console.log('💓 Server Heartbeat:', data);
});
```

### 3. **Network Testing Tools**

```javascript
// Test server reachability
const testServer = async (url) => {
  try {
    const response = await fetch(url + '/api/health');
    console.log('Server reachable:', response.status);
  } catch (error) {
    console.log('Server not reachable:', error);
  }
};
```

---

## 🛠️ Troubleshooting Checklist

### ✅ Server Configuration
- [ ] CORS configuration cho APK
- [ ] Environment variables set
- [ ] Socket.IO debug enabled
- [ ] Rate limiting disabled cho testing
- [ ] Proper timeouts configured

### ✅ Network Configuration  
- [ ] Server accessible trên network
- [ ] Firewall cho phép port 3000
- [ ] HTTPS certificates (nếu production)
- [ ] DNS resolution

### ✅ Android Configuration
- [ ] Network security config
- [ ] Internet permissions
- [ ] Cleartext traffic allowed
- [ ] Correct server URL

### ✅ App Configuration
- [ ] Socket.IO client properly configured
- [ ] Transport settings for mobile
- [ ] Proper error handling
- [ ] Connection monitoring

---

## 📊 Monitoring & Analytics

### Server Stats Endpoint

```javascript
// GET /api/socket/stats
{
  "totalConnections": 5,
  "apkClients": 3,
  "webClients": 2,
  "activeRooms": ["user_123", "group_456"],
  "serverUptime": "2 hours"
}
```

### APK-specific Events

```javascript
// Server emits these for APK monitoring
socket.emit('apkConnectionConfirmed', data);
socket.emit('apkReconnected', data);
socket.emit('serverHeartbeat', data);
```

---

## 🆘 Common Issues & Solutions

### Issue 1: "Connection timeout"
**Solution:** Tăng timeout trong client và check network

### Issue 2: "CORS error" 
**Solution:** Set `ALLOWED_ORIGINS=*` hoặc add domain

### Issue 3: "Cannot connect to server"
**Solution:** Check server IP, port, và network security config

### Issue 4: "Polling transport only"
**Solution:** Normal cho APK, websocket sẽ upgrade sau

### Issue 5: "Frequent disconnections"
**Solution:** Tăng pingTimeout và reconnection settings

---

## 📞 Debug Contacts

Khi gặp vấn đề, check:

1. **Server logs:** `logs/combined.log`
2. **Socket stats:** `GET /api/socket/stats` 
3. **Network connectivity:** `ping server-ip`
4. **APK debug:** Enable `SOCKET_DEBUG=true` 