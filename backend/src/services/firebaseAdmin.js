// src/services/firebaseAdmin.js
// Firebase Admin SDK initialization for email verification only.
// The platform keeps its own bcrypt/JWT auth — Firebase is used purely
// for generating secure email verification links.

const admin = require('firebase-admin');

let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;

  try {
    const base64ServiceAccount = process.env.FIREBASE_BASE64_ADMIN_KEY || process.env.FIREBASE_BASE64_SERVICE_ACCOUNT;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (base64ServiceAccount) {
      // Option A: Base64 encoded JSON string (Recommended for easy deployment)
      const decodedBuffer = Buffer.from(base64ServiceAccount, 'base64');
      const serviceAccount = JSON.parse(decodedBuffer.toString('utf-8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (serviceAccountPath) {
      // Option B: JSON file path
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // Option C: Individual env vars
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Private key comes with escaped newlines from env var
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      console.warn('⚠️ Firebase credentials not configured. Email verification will use fallback token-based flow.');
      return;
    }

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
  } catch (err) {
    console.error('❌ Firebase Admin SDK initialization failed:', err.message);
  }
}

/**
 * Create a Firebase user record for email verification purposes.
 * This is a "shadow user" — the real auth stays on bcrypt/JWT.
 */
async function createFirebaseUser(email, password) {
  if (!firebaseInitialized) return null;

  try {
    // Check if user already exists in Firebase
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      return existingUser;
    } catch (e) {
      // User doesn't exist — create them
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
    });
    return userRecord;
  } catch (err) {
    console.error('Firebase createUser error:', err.message);
    return null;
  }
}

/**
 * Generate an email verification link using Firebase.
 * The link, when clicked, will redirect to our frontend verification page.
 */
async function generateVerificationLink(email) {
  if (!firebaseInitialized) return null;

  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

  try {
    const link = await admin.auth().generateEmailVerificationLink(email, {
      url: `${frontendUrl}/verify-email`,
      handleCodeInApp: false,
    });
    return link;
  } catch (err) {
    console.error('Firebase generateVerificationLink error:', err.message);
    return null;
  }
}

/**
 * Check if a Firebase user's email is verified.
 */
async function isEmailVerified(email) {
  if (!firebaseInitialized) return false;

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    return userRecord.emailVerified;
  } catch (err) {
    console.error('Firebase isEmailVerified error:', err.message);
    return false;
  }
}

/**
 * Check if Firebase is available (credentials configured).
 */
function isFirebaseAvailable() {
  return firebaseInitialized;
}

// Initialize on module load
initializeFirebase();

module.exports = {
  createFirebaseUser,
  generateVerificationLink,
  isEmailVerified,
  isFirebaseAvailable,
  admin: firebaseInitialized ? admin : null,
};
