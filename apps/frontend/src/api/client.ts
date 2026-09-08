import axios from "axios";

export const api = axios.create({
  // Local Vite requests use the development proxy; deployed builds use Render.
  baseURL: import.meta.env.DEV
    ? "/api"
    : "https://digital-logbook-backend-latest.onrender.com/api",
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
