const { mongoose } = require("../db");

const sessionSchema = new mongoose.Schema({
  token_hash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expires_at: { type: Date, required: true },
});

sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
