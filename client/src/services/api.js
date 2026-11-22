import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
export const api = axios.create({ baseURL, withCredentials: true });

let accessToken = null;
let refreshRequest = null;
export function setAccessToken(token) {
  accessToken = token || null;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retried ||
        original.url?.includes('/auth/login') || original.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }
    original._retried = true;
    try {
      refreshRequest ||= api.post('/auth/refresh').finally(() => { refreshRequest = null; });
      const { data } = await refreshRequest;
      setAccessToken(data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshError) {
      setAccessToken(null);
      window.dispatchEvent(new Event('ems:unauthorized'));
      return Promise.reject(refreshError);
    }
  },
);

export function getErrorMessage(error) {
  return error.response?.data?.message || error.response?.data?.error || error.message || 'Something went wrong.';
}
