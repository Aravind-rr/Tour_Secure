// frontend/src/services/geofencing/geo.ts

import { get, post } from "@/lib/api";

export type RiskLevel = "low" | "medium" | "high";

export type Zone = {
  _id: string;
  name: string;
  description?: string;
  riskLevel: RiskLevel;
  riskScore: number;
  polygon: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  createdAt: string;
  updatedAt: string;
};

export type PointCheck = {
  inside: boolean;
  riskLevel: RiskLevel | "safe";
  riskScore: number;
  matchedZones: Array<{
    id: string;
    name: string;
    riskLevel: RiskLevel;
    riskScore: number;
  }>;
};

export type CreateZoneInput = Pick<
  Zone,
  "name" | "description" | "riskLevel" | "riskScore" | "polygon"
>;

export const listZones = () => get<Zone[]>("/geo/zones");

export const checkPoint = (lat: number, lng: number) =>
  post<PointCheck, { lat: number; lng: number }>("/geo/check", { lat, lng });

export const createZone = (zone: CreateZoneInput) =>
  post<Zone, CreateZoneInput>("/geo/zones", zone);
