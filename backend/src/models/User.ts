// backend/src/models/User.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IEmergencyContact {
  name: string;
  phone: string;
  relation?: string;
  email?: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string; // hashed
  role?: "user" | "admin";
  emergencyContacts?: IEmergencyContact[];
  interests?: string[]; // recommendation categories the user prefers
  avoidUnsafe?: boolean; // hide low-safety places in recommendations
  walletAddress?: string;
  blockchainAddress?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EmergencyContactSchema = new Schema<IEmergencyContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    relation: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
  },
  { _id: true }
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // You can keep select:false for safety; login route adds .select('+password')
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    emergencyContacts: { type: [EmergencyContactSchema], default: [] },
    interests: { type: [String], default: [] },
    avoidUnsafe: { type: Boolean, default: true },
    // previously written by digital-id / wallet routes but missing from the schema
    // (so Mongoose silently dropped them)
    walletAddress: { type: String },
    blockchainAddress: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
