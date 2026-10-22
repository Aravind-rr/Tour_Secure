import axios from "axios";
import { API_BASE } from "./api";

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export default http;
