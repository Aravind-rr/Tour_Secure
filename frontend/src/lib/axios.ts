// frontend/src/lib/axios.ts
import axios from "axios";
import { API_BASE } from "./api";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// ✅ Make 401s from *public* endpoints silent
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",    // we treat 401 here as "not logged in", not an error popup
];

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url || "";
    const isPublic = PUBLIC_PATHS.some((p) => url.endsWith(p) || url.includes(p));

    // For 401 on public endpoints, don't throw a global "Not authorized" toast
    if (status === 401 && isPublic) {
      // Let the caller handle it gracefully (e.g., return null for /me)
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);
console.log("API baseURL:", api.defaults.baseURL);
