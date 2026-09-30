import mongoose, { Schema, Document, Types } from "mongoose";

export interface IReview extends Document {
  rating: number;                 // 1..5
  text?: string;
  area?: Types.ObjectId | null;   // ref -> SafetyScore
  areaName?: string | null;       // denormalized name for quick display
  userId?: Types.ObjectId | null; // author id (optional)
  userName?: string | null;       // denormalized author name for UI
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: "" },
    area: { type: Schema.Types.ObjectId, ref: "SafetyScore", default: null },
    areaName: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, default: null },
  },
  { timestamps: true, collection: "reviews" }
);

// Virtual for consistent UI field
ReviewSchema.virtual("placeName").get(function (this: IReview) {
  return this.areaName || null;
});

ReviewSchema.set("toJSON", { virtuals: true });
ReviewSchema.set("toObject", { virtuals: true });

export default (mongoose.models.Review as mongoose.Model<IReview>) ||
  mongoose.model<IReview>("Review", ReviewSchema);
