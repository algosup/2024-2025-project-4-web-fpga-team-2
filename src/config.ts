const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'http://localhost:5001'  // Local server when in production
  : 'http://localhost:5001';  // Local server when in development

export default API_BASE_URL;