import axios from 'axios';

// Erstellt eine neue axios-Instanz mit einer festen Basis-URL.
const apiClient = axios.create({
  baseURL: 'http://localhost:5000', // Die Adresse Ihres Backend-Servers
});

export default apiClient;