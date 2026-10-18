import mongoose from "mongoose";

/**
 * Safe check-in ("dead man's switch"): the tourist promises to check in by
 * `dueAt`. If they don't, the sweeper escalates it into an Alert.
 */
const CheckInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, maxlength: 120, default: "Safe check-in" },
    dueAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "completed", "escalated", "cancelled"], default: "active", index: true },
    lat: Number,
    lon: Number,
    lastSeenAt: { type: Date },
    alertId: { type: mongoose.Types.ObjectId, ref: "Alert" },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CheckInSchema.index({ status: 1, dueAt: 1 });

export default mongoose.models.CheckIn || mongoose.model("CheckIn", CheckInSchema);
