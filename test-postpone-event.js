const axios = require('axios');

// Test script để kiểm tra API postpone event
async function testPostponeEvent() {
  try {
    const eventId = 'YOUR_EVENT_ID'; // Thay bằng event ID thực tế
    const adminToken = 'YOUR_ADMIN_TOKEN'; // Thay bằng admin token thực tế
    
    console.log('🧪 Testing postpone event API...');
    
    const response = await axios.put(
      `http://localhost:3000/api/events/postpone/${eventId}`,
      {
        reason: 'Test postpone event - ' + new Date().toISOString()
      },
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ API Response:', response.data);
    
  } catch (error) {
    console.error('❌ API Error:', error.response?.data || error.message);
  }
}

// Test socket connection
async function testSocketConnection() {
  const io = require('socket.io-client');
  
  console.log('🔌 Testing socket connection...');
  
  const socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling'],
    timeout: 20000
  });
  
  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    
    // Test join user room
    socket.emit('joinRoom', 'test-user-id');
    
    // Test join event room
    socket.emit('joinEventRoom', {
      eventId: 'test-event-id',
      userId: 'test-user-id'
    });
    
    // Listen for eventPostponed
    socket.on('eventPostponed', (data) => {
      console.log('🚫 Received eventPostponed:', data);
    });
    
    // Test ping
    socket.emit('ping', (response) => {
      console.log('🏓 Ping response:', response);
    });
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });
  
  socket.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error);
  });
  
  return socket;
}

// Run tests
async function runTests() {
  console.log('🚀 Starting tests...');
  
  // Test socket first
  const socket = await testSocketConnection();
  
  // Wait a bit then test API
  setTimeout(async () => {
    await testPostponeEvent();
    
    // Cleanup
    setTimeout(() => {
      socket.disconnect();
      console.log('🧹 Tests completed');
    }, 2000);
  }, 3000);
}

// Uncomment to run tests
// runTests();

module.exports = { testPostponeEvent, testSocketConnection };
