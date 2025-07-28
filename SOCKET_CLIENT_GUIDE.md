# Socket.IO Client Configuration for Mobile APK

## 🔧 Client Configuration (React Native/Flutter/Mobile)

### Recommended Settings for APK

```javascript
import io from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  // ✅ Transport configuration - Ưu tiên polling cho mobile
  transports: ['polling', 'websocket'],
  
  // ✅ Reconnection settings
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  maxReconnectionAttempts: 5,
  timeout: 20000,
  
  // ✅ Heartbeat settings
  heartbeatInterval: 30000,
  heartbeatTimeout: 60000,
  
  // ✅ Upgrade settings
  upgrade: true,
  rememberUpgrade: false,
  
  // ✅ Additional headers nếu cần
  extraHeaders: {
    'User-Agent': 'YourApp/1.0.0'
  }
});
```

### Connection Events

```javascript
// ✅ Kết nối thành công
socket.on('connect', () => {
  console.log('✅ Connected to server:', socket.id);
  console.log('Transport:', socket.io.engine.transport.name);
  
  // Join personal room
  socket.emit('joinRoom', userId);
  
  // Join group nếu cần
  socket.emit('joinGroup', groupId);
});

// ✅ Transport upgrade
socket.io.on('upgrade', (transport) => {
  console.log('🔄 Upgraded to:', transport.name);
});

// ✅ Connection error
socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// ✅ Disconnect
socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    socket.connect();
  }
});

// ✅ Reconnect
socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Reconnected after', attemptNumber, 'attempts');
});
```

### Testing Connection

```javascript
// ✅ Test connection
socket.emit('testConnection', { message: 'ping' }, (response) => {
  console.log('📡 Server response:', response);
});

// ✅ Manual ping
socket.emit('ping', (response) => {
  console.log('🏓 Pong:', response);
});
```

### Event Listeners

```javascript
// ✅ Server heartbeat
socket.on('serverHeartbeat', (data) => {
  console.log('💓 Server heartbeat:', data);
});

// ✅ Location updates
socket.on('location:update', (data) => {
  console.log('📍 Location update:', data);
  // Update UI with new location
});

// ✅ Test messages
socket.on('testMessage', (data) => {
  console.log('📨 Test message:', data);
});
```

## 🚀 Testing Endpoints

### Check Socket.IO Status
```
GET /api/socket/status
```

### Test Broadcast
```
POST /api/socket/test-broadcast
{
  "roomId": "user_123" or "group_456",
  "event": "testMessage",
  "data": {
    "message": "Hello from server"
  }
}
```

## 🐛 Troubleshooting APK Issues

### Common Issues:

1. **WebSocket fails on mobile networks**
   - Solution: Use polling first `transports: ['polling', 'websocket']`

2. **Connection timeout on slow networks**
   - Solution: Increase timeout values

3. **App goes to background**
   - Solution: Handle app state changes and reconnect when needed

4. **HTTPS vs HTTP issues**
   - Solution: Ensure server supports both protocols

5. **Firewall/Proxy blocking WebSocket**
   - Solution: Fallback to polling transport

### Network State Handling (React Native)

```javascript
import NetInfo from '@react-native-async-storage/async-storage';

NetInfo.addEventListener(state => {
  if (state.isConnected) {
    if (!socket.connected) {
      socket.connect();
    }
  } else {
    socket.disconnect();
  }
});
```

### App State Handling (React Native)

```javascript
import { AppState } from 'react-native';

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active') {
    // App came to foreground
    if (!socket.connected) {
      socket.connect();
    }
  } else if (nextAppState === 'background') {
    // App went to background
    // Optionally disconnect to save battery
    // socket.disconnect();
  }
});
```

## 📱 Production Checklist

- [ ] Use HTTPS in production
- [ ] Configure proper CORS origins
- [ ] Set appropriate timeouts for mobile networks
- [ ] Handle network state changes
- [ ] Handle app state changes (foreground/background)
- [ ] Implement proper error handling
- [ ] Add logging for debugging
- [ ] Test on different network conditions (WiFi, 3G, 4G, 5G)
- [ ] Test with app in background/foreground
- [ ] Verify reconnection works properly 