const { mongoose } = require("../db");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password_hash: { type: String, required: true, select: false },
    password_salt: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "seller","admin"], default: "user", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

