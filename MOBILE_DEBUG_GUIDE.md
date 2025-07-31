# 🔧 Socket Debug Guide cho Thiết Bị Thật

## 🚨 Các vấn đề thường gặp khi chạy trên thiết bị thật

### 1. Kiểm tra kết nối server

Trước tiên, test xem server có accessible từ thiết bị không:

```bash
# Test endpoint này từ browser trên mobile
GET http://YOUR_SERVER_IP:3000/api/socket/mobile-test
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "message": "Server is reachable from mobile",
  "serverTime": "2024-01-01T00:00:00.000Z",
  "serverIP": "::1",
  "userAgent": "Your-Mobile-App/1.0",
  "headers": {...}
}
```

### 2. Kiểm tra Socket.IO status

```bash
GET http://YOUR_SERVER_IP:3000/api/socket/status
```

### 3. Test Socket Connection từ mobile app

**Cấu hình client chính xác:**

```javascript
import io from 'socket.io-client';

const socket = io('http://YOUR_SERVER_IP:3000', {
  // ⚠️ QUAN TRỌNG: Ưu tiên polling cho mobile
  transports: ['polling', 'websocket'],
  
  // ⚠️ Tăng timeout cho mobile network chậm
  timeout: 60000, // 1 phút
  
  // Reconnection settings
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  
  // Force polling first (quan trọng cho thiết bị thật)
  upgrade: true,
  rememberUpgrade: false,
  
  // Headers để debug
  extraHeaders: {
    'User-Agent': 'YourApp/1.0.0 (Mobile)'
  }
});
```

### 4. Logs để debug

**Thêm logs này vào mobile app:**

```javascript
socket.on('connect', () => {
  console.log('✅ CONNECTED:', socket.id);
  console.log('Transport:', socket.io.engine.transport.name);
  
  // Test connection ngay khi connect
  socket.emit('testConnection', { test: 'ping' }, (response) => {
    console.log('📡 Test response:', response);
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ CONNECTION ERROR:', error.message);
  console.error('Error type:', error.type);
  console.error('Error description:', error.description);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 DISCONNECTED:', reason);
});

socket.io.on('error', (error) => {
  console.error('🚨 IO ERROR:', error);
});

// Log transport upgrades
socket.io.on('upgrade', (transport) => {
  console.log('🔄 UPGRADED to:', transport.name);
});

socket.io.on('upgradeError', (error) => {
  console.error('❌ UPGRADE ERROR:', error);
});
```

## 🔍 Troubleshooting Steps

### Bước 1: Kiểm tra Network
- Đảm bảo thiết bị và server cùng network (hoặc server accessible từ internet)
- Ping server IP từ mobile
- Kiểm tra firewall/proxy

### Bước 2: Kiểm tra Server Logs
Server sẽ log chi tiết:
```bash
🔍 Connection attempt from: { id, ip, userAgent, origin, transport }
📱 Client Details: { id, transport, ip, userAgent, origin }
🔗 Client kết nối: socket_id | Transport: polling
```

### Bước 3: Test từ Browser Mobile
Mở browser trên mobile và test:
```javascript
const socket = io('http://YOUR_SERVER_IP:3000', {
  transports: ['polling', 'websocket']
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('testConnection', {test: 'from mobile browser'}, console.log);
});
```

### Bước 4: Kiểm tra Common Issues

#### ❌ CORS Error
**Triệu chứng:** Connection failed, CORS error trong logs
**Giải pháp:** Server config đã được sửa để accept mobile apps

#### ❌ Transport Error  
**Triệu chứng:** Websocket fails, polling fails
**Giải pháp:** Sử dụng `transports: ['polling']` only

#### ❌ Timeout Error
**Triệu chứng:** Connection timeout
**Giải pháp:** Tăng timeout values

#### ❌ Network Error
**Triệu chứng:** Cannot reach server
**Giải pháp:** 
- Kiểm tra IP/Port
- Tắt WiFi, dùng 4G để test
- Kiểm tra firewall

## 🧪 Debug Commands

### Test broadcast từ server:
```bash
curl -X POST http://YOUR_SERVER_IP:3000/api/socket/test-broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "user_123",
    "event": "testMessage", 
    "data": {"message": "Hello mobile!"}
  }'
```

### Kiểm tra connected clients:
```bash
curl http://YOUR_SERVER_IP:3000/api/socket/status
```

## 📱 Mobile App Integration

### React Native
```javascript
import NetInfo from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Network state monitoring
NetInfo.addEventListener(state => {
  if (state.isConnected && !socket.connected) {
    socket.connect();
  }
});

// App state monitoring  
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active' && !socket.connected) {
    socket.connect();
  }
});
```

### Flutter
```dart
import 'package:connectivity_plus/connectivity_plus.dart';

Connectivity().onConnectivityChanged.listen((ConnectivityResult result) {
  if (result != ConnectivityResult.none && !socket.connected) {
    socket.connect();
  }
});
```

## 🔧 Environment Variables

Đảm bảo set các env variables này:

```env
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://YOUR_MOBILE_APP_DOMAIN
```

## 📞 Emergency Debugging

Nếu vẫn không kết nối được:

1. **Tạm thời disable CORS checking:**
   - Sửa `src/config/socket.js` dòng 11: `origin: "*"`

2. **Force polling only:**
   - Client: `transports: ['polling']`
   - Server đã support polling priority

3. **Kiểm tra server logs realtime:**
   ```bash
   tail -f logs/combined.log
   ```

4. **Test với ngrok (cho development):**
   ```bash
   ngrok http 3000
   # Sử dụng ngrok URL thay vì localhost
   ``` 