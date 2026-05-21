const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    
    //console.log('🔌 Connecting to MongoDB Atlas...');
    
    // Remove quotes if they exist in the URI
    const cleanUri = mongoUri.replace(/"/g, '');
    
    const conn = await mongoose.connect(cleanUri);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    //console.log(`📊 Database: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error('Please check:');
    console.error('1. Is your MongoDB Atlas cluster running?');
    console.error('2. Is your IP address whitelisted in MongoDB Atlas?');
    console.error('3. Is your password correct?');
    console.error('4. Check network connectivity');
    process.exit(1);
  }
};

module.exports = connectDB;