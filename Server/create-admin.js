require("dotenv").config();

const Session = require("./models/Session");
const User = require("./models/User");
const { hashPassword } = require("./auth");
const { connectDatabase, mongoose } = require("./db");

async function createAdmin() {
  const email = typeof process.env.ADMIN_EMAIL === "string" ? process.env.ADMIN_EMAIL.trim().toLowerCase() : "";
  const password = process.env.ADMIN_PASSWORD || "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set a valid ADMIN_EMAIL before running this command");
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD must be between 12 and 128 characters");
  }

  await connectDatabase();
  const passwordFields = await hashPassword(password);
  const existingUser = await User.findOne({ email });
  let admin;

  if (existingUser) {
    existingUser.set({ ...passwordFields, role: "admin" });
    admin = await existingUser.save();
    await Session.deleteMany({ user: admin._id });
  } else {
    admin = await User.create({ email, ...passwordFields, role: "admin" });
  }

  console.log(`Admin account is ready for ${admin.email}.`);
}

createAdmin()
  .catch((error) => {
    console.error("Could not create admin account:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
