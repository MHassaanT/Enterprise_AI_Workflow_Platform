const WhatsAppConnectionManager = require('./src/connection-manager');
const { query } = require('../../backend/src/db');

// Singleton instance embedded in the backend process
let instance = null;

const getWhatsAppManager = () => {
  if (!instance) {
    instance = new WhatsAppConnectionManager(query);
  }
  return instance;
};

module.exports = {
  getWhatsAppManager,
  WhatsAppConnectionManager,
};
