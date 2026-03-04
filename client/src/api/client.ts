import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

export default api;

export { BACKEND_URL };
