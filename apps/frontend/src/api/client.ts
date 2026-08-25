import axios from "axios";

export const api = axios.create({
  // Hardcoded for production to bypass Vite/Cloudflare root directory env loading issues
  baseURL: "https://digital-logbook-backend-latest.onrender.com/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to requests if stored in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});