import axios from "axios";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

const TOKEN_KEY = "pizza_admin_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const adminApi = () => axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api/admin`,
  headers: { Authorization: `Bearer ${getToken()}` },
});

export function errorText(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Etwas ist schiefgelaufen. Bitte erneut versuchen.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => (d && typeof d.msg === "string" ? d.msg : JSON.stringify(d))).join(" ");
  if (typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
