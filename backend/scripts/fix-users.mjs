// backend/scripts/fix-users.mjs
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, index: true },
    passwordHash: String,
    // some old rows might have a bad plaintext "password" — we'll migrate
    password: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { collection: "users" }
);
const User = mongoose.model("User", userSchema);

async function main() {
  const uri = process.env.MONGO_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGO_URL (or MONGO_URI/MONGODB_URI) in backend/.env");
  await mongoose.connect(uri);

  const [, , cmd, ...args] = process.argv;

  if (cmd === "--list") {
    const users = await User.find({}, { email: 1, passwordHash: 1, password: 1 }).lean();
    console.table(users.map(u => ({
      email: u.email,
      hasHash: !!u.passwordHash,
      hasPlain: typeof u.password === "string" && u.password.length > 0
    })));
  } else if (cmd === "--purge-broken") {
    const res = await User.deleteMany({
      $and: [
        { $or: [ { passwordHash: { $exists: false } }, { passwordHash: null }, { passwordHash: "" } ] },
        { $or: [ { password: { $exists: false } }, { password: null }, { password: "" } ] }
      ]
    });
    console.log(`Deleted ${res.deletedCount} users with no hash and no plaintext password.`);
  } else if (cmd === "--reset") {
    const [emailRaw, pass] = args;
    if (!emailRaw || !pass) {
      console.log("Usage: node scripts/fix-users.mjs --reset <email> <newPassword>");
      process.exit(1);
    }
    const email = String(emailRaw).toLowerCase().trim();
    const hash = await bcrypt.hash(String(pass), 12);
    const res = await User.updateOne({ email }, { $set: { passwordHash: hash, password: undefined, role: "user" } });
    if (res.matchedCount === 0) {
      await User.create({ name: "Demo User", email, passwordHash: hash, role: "user" });
      console.log("Created user:", email);
    } else {
      console.log("Password reset for:", email);
    }
  } else {
    console.log(
      "Usage:\n" +
      "  node scripts/fix-users.mjs --list\n" +
      "  node scripts/fix-users.mjs --purge-broken\n" +
      "  node scripts/fix-users.mjs --reset <email> <newPassword>\n"
    );
  }

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
