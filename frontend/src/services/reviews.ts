// frontend/src/services/reviews.ts

import { API_BASE } from "@/lib/api";

export type Review = {
  _id: string;
  area?: string;
  areaName: string;
  rating: number;
  text?: string;
  createdAt: string;
};

export type ReviewResponse = {
  review: Review;
  area?: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    safety_score: number;
  };
};

/** Fetch latest reviews (optionally filter by areaName or areaId) */
export async function fetchReviews(opts?: {
  areaId?: string;
  areaName?: string;
  limit?: number;
}): Promise<Review[]> {
  const params = new URLSearchParams();
  if (opts?.areaId) params.set("areaId", opts.areaId);
  if (opts?.areaName) params.set("areaName", opts.areaName);
  if (opts?.limit) params.set("limit", String(opts.limit));

  const r = await fetch(`${API_BASE}/reviews?${params.toString()}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error("Failed to fetch reviews");
  const data = await r.json();
  return Array.isArray(data) ? data : data?.reviews ?? data?.items ?? [];
}

/** Submit a new review, returns the review + updated area safety score */
export async function submitReview(
  areaName: string,
  rating: number,
  comment?: string
): Promise<ReviewResponse> {
  const r = await fetch(`${API_BASE}/reviews`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      areaName: areaName.trim(),
      rating: Number(rating),
      comment: (comment ?? "").trim(),
    }),
  });

  const data: ReviewResponse = await r.json();
  if (!r.ok) throw new Error((data as any)?.error || "Failed to submit review");

  // 🔔 Fire a custom event so SafetyHeatmap refreshes instantly
  window.dispatchEvent(new CustomEvent("heatmap:refresh"));

  return data;
}
