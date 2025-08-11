import axios from 'axios';
const apiClient = axios.create({
  baseURL: 'http://localhost:5000', // Die Adresse Ihres Backend-Servers
  // baseURL: 'https://dashboard.mobiliti.at', // Die Adresse Ihres Live-Backend-Servers
  withCredentials: true,
});

export default apiClient;