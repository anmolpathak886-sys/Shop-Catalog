const { createHash, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const Session = require("./models/Session");

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return { password_hash: hash.toString("hex"), password_salt: salt };
}

async function verifyPassword(password, user) {
  const expected = Buffer.from(user.password_hash, "hex");
  const actual = await scrypt(password, user.password_salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await Session.create({ token_hash: tokenHash, user: userId, expires_at: expiresAt });
  return { token, expires_at: expiresAt };
}

async function requireAuth(req, res, next) {
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: "Please log in to continue" });

    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const session = await Session.findOne({
      token_hash: tokenHash,
      expires_at: { $gt: new Date() },
    }).populate("user", "email role");

    if (!session?.user) return res.status(401).json({ error: "Your session has expired; please log in again" });

    req.authUser = session.user;
    req.authSession = session;
    return next();
  } catch (error) {
    console.error("Could not authenticate request:", error.message);
    return res.status(500).json({ error: "Could not authenticate request" });
  }
}

function requireAdmin(req, res, next) {
  if (req.authUser?.role !== "admin") {
    return res.status(403).json({ error: "Admin access is required" });
  }
  return next();
}
function requireSeller(req, res, next) {
  if (!["admin", "seller"].includes(req.authUser?.role)) {
    return res.status(403).json({ error: "Seller or admin access is required" });
  }
  return next();
}
module.exports = { createSession, hashPassword, requireAdmin, requireAuth, requireSeller, verifyPassword };
