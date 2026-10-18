// frontend/src/services/safetyCenter.ts
// Emergency contacts, preferences, safe check-ins and SOS alerts.
import { http } from "@/lib/http";
import type { CategoryId } from "@/lib/categories";

export type EmergencyContact = { id?: string; name: string; phone: string; relation?: string; email?: string };
export type Profile = {
  name: string | null;
  email: string | null;
  emergencyContacts: EmergencyContact[];
  interests: CategoryId[];
  avoidUnsafe: boolean;
};

export type CheckIn = {
  id: string;
  label: string;
  dueAt: string;
  status: "active" | "completed" | "escalated" | "cancelled";
  lat: number | null;
  lon: number | null;
  alertId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type MyAlert = {
  id: string;
  type: "sos" | "checkin_missed" | "anomaly";
  status: "open" | "acknowledged" | "resolved" | "cancelled";
  lat: number | null;
  lon: number | null;
  message: string | null;
  createdAt: string;
  trackUrl: string | null;
  shareActive: boolean;
};

export type SosResult = {
  id: string;
  trackUrl: string;
  shareText: string;
  contacts: Array<{ name: string; phone: string; relation: string | null }>;
};

export async function getProfile(): Promise<Profile> {
  const { data } = await http.get("/profile");
  return data.profile;
}
export async function saveContacts(contacts: EmergencyContact[]): Promise<Profile> {
  const { data } = await http.put("/profile/contacts", { contacts });
  return data.profile;
}
export async function savePreferences(p: { interests?: CategoryId[]; avoidUnsafe?: boolean }): Promise<Profile> {
  const { data } = await http.put("/profile/preferences", p);
  return data.profile;
}

export async function getActiveCheckIn(): Promise<{ checkIn: CheckIn | null; recent: CheckIn[]; serverTime: string }> {
  const { data } = await http.get("/checkins/active");
  return data;
}
export async function startCheckIn(input: { minutes: number; label?: string; lat?: number; lon?: number }): Promise<CheckIn> {
  const { data } = await http.post("/checkins", input);
  return data.checkIn;
}
export async function completeCheckIn(id: string) {
  const { data } = await http.post(`/checkins/${id}/complete`, {});
  return data.checkIn as CheckIn;
}
export async function extendCheckIn(id: string, minutes: number) {
  const { data } = await http.post(`/checkins/${id}/extend`, { minutes });
  return data.checkIn as CheckIn;
}
export async function cancelCheckIn(id: string) {
  await http.post(`/checkins/${id}/cancel`, {});
}
export async function pingCheckIn(id: string, lat: number, lon: number) {
  await http.post(`/checkins/${id}/ping`, { lat, lon }).catch(() => {});
}

export async function sendSos(input: { lat?: number; lon?: number; accuracy?: number; message?: string }): Promise<SosResult> {
  const { data } = await http.post("/alerts/panic", input);
  return data;
}
export async function updateSosLocation(id: string, lat: number, lon: number, accuracy?: number) {
  await http.post(`/alerts/${id}/location`, { lat, lon, accuracy }).catch(() => {});
}
export async function cancelSos(id: string, reason: "safe" | "false_alarm") {
  const { data } = await http.post(`/alerts/${id}/cancel`, { reason });
  return data;
}
export async function getMyAlerts(): Promise<MyAlert[]> {
  const { data } = await http.get("/alerts/mine");
  return data.items ?? [];
}
export async function getTrack(token: string) {
  const { data } = await http.get(`/alerts/track/${token}`);
  return data as {
    ok: boolean;
    type: string;
    status: string;
    name: string;
    message: string | null;
    createdAt: string;
    updatedAt: string;
    last: { lat: number; lon: number; at: string } | null;
    trail: Array<{ lat: number; lon: number; at: string }>;
  };
}

export const EMERGENCY_NUMBERS = [
  { label: "All emergencies", number: "112", emoji: "🚨" },
  { label: "Police", number: "100", emoji: "👮" },
  { label: "Ambulance", number: "108", emoji: "🚑" },
  { label: "Fire", number: "101", emoji: "🚒" },
  { label: "Women helpline", number: "1091", emoji: "🛡️" },
  { label: "Tourist helpline (24x7)", number: "1800111363", emoji: "🧳" },
  { label: "Cyber fraud", number: "1930", emoji: "💳" },
];

/** WhatsApp / SMS deep links for sharing an alert with a contact. */
export function waLink(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function smsLink(phone: string, text: string) {
  return `sms:${phone.replace(/\s+/g, "")}?body=${encodeURIComponent(text)}`;
}
