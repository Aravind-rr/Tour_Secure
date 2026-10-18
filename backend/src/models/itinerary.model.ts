import { Schema, model, Document, Types } from "mongoose";

export interface IItinerary extends Document {
  title: string;
  date?: string;          // e.g. "2025-10-29"
  time?: string;          // e.g. "09:30"
  location?: string;
  notes?: string;
  category?: string;      // historic | entertainment | fun | food | nature | spiritual | shopping
  lat?: number;
  lng?: number;
  placeId?: string;       // id from the recommendations catalogue (if added from there)
  source?: "manual" | "recommendation" | "plan" | "assistant";
  done?: boolean;
  user: Types.ObjectId;   // <- owner
  createdAt: Date;
  updatedAt: Date;
}

const ItinerarySchema = new Schema<IItinerary>(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String },
    time: { type: String, trim: true },
    location: { type: String, trim: true },
    notes: { type: String, trim: true },
    category: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    placeId: { type: String },
    source: { type: String, enum: ["manual", "recommendation", "plan", "assistant"], default: "manual" },
    done: { type: Boolean, default: false },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "itineraries" }
);

ItinerarySchema.index({ user: 1, createdAt: -1 });

export default model<IItinerary>("Itinerary", ItinerarySchema);
