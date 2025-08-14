const axios = require('axios');

// Test script để kiểm tra API createGroup
const testCreateGroup = async () => {
  try {
    console.log('🧪 Testing createGroup API...');
    
    const testData = {
      eventId: '507f1f77bcf86cd799439011', // Test event ID
      groupName: 'Test Group',
      ownerId: '507f1f77bcf86cd799439012', // Test user ID
      memberIds: [],
      showtimeId: '507f1f77bcf86cd799439013' // Test showtime ID
    };
    
    console.log('📤 Request data:', testData);
    
    const response = await axios.post('https://api.eventsphere.io.vn/api/connects/createGroup', testData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log('✅ Response status:', response.status);
    console.log('✅ Response data:', response.data);
    console.log('✅ Response type:', typeof response.data);
    console.log('✅ Has _id:', !!response.data._id);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('❌ Status:', error.response?.status);
  }
};

// Chạy test
testCreateGroup();
