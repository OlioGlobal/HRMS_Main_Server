const mongoose = require('mongoose');

const connectDB = async () => {
  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.DB_NAME || 'hrms',
      });
      console.log(`✅ MongoDB connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      attempt++;
      console.error(`❌ MongoDB attempt ${attempt} failed: ${error.message}`);
      if (attempt >= MAX_RETRIES) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
};

module.exports = connectDB;
