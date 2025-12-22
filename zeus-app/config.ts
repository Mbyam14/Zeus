/**
 * Configuration file for Zeus App
 *
 * IMPORTANT FOR DEVELOPERS:
 * Update API_BASE_URL with your computer's local IP address when developing
 *
 * To find your IP address:
 * - Windows: Run 'ipconfig' in Command Prompt, look for IPv4 Address
 * - Mac/Linux: Run 'ifconfig' in Terminal, look for inet address
 *
 * Example: If your IP is 192.168.1.100, set:
 * API_BASE_URL: 'http://192.168.1.100:8000'
 */

export const config = {
  // Backend API URL - UPDATE THIS WITH YOUR LOCAL IP
  API_BASE_URL: 'http://192.168.86.31:8000',

  // Other configuration options
  API_TIMEOUT: 10000, // 10 seconds
};

// For production, you would set this to your production API URL
// Example: API_BASE_URL: 'https://api.zeus-app.com'
