const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/shop_catalog";

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
  });

  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
}

module.exports = { connectDatabase, mongoose };
