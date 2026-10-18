import mongoose from "mongoose";

/**
 * Alert = an incident that needs attention: a manual SOS, a missed safe
 * check-in, or (future) an anomaly from the route-deviation service.
 * Older documents only have userId/lat/lon/meta; new fields have defaults.
 */
const TrailPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    accuracy: { type: Number },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AlertSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Types.ObjectId, ref: "User" },
    type: { type: String, enum: ["sos", "checkin_missed", "anomaly"], default: "sos", index: true },
    status: { type: String, enum: ["open", "acknowledged", "resolved", "cancelled"], default: "open", index: true },
    lat: Number,
    lon: Number,
    message: { type: String, trim: true, maxlength: 500 },
    trail: { type: [TrailPointSchema], default: [] },
    shareToken: { type: String, index: true, sparse: true },
    shareExpiresAt: { type: Date },
    contactsNotified: { type: [String], default: [] },
    notifiedWebhook: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Types.ObjectId, ref: "User" },
    resolutionNote: { type: String, trim: true, maxlength: 500 },
    meta: Object,
  },
  { timestamps: true }
);

export default mongoose.models.Alert || mongoose.model("Alert", AlertSchema);
