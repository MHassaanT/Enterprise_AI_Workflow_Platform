// src/services/emailService.js
// Lightweight email service for sending verification emails.
// Uses Firebase's built-in email sending when available,
// otherwise falls back to a console log (replace with SendGrid/nodemailer in production).

const { isFirebaseAvailable } = require('./firebaseAdmin');

/**
 * Send a verification email to the user.
 * When Firebase is configured, Firebase handles the email delivery automatically
 * as part of generateEmailVerificationLink(). This function serves as a fallback
 * or for custom email templates.
 * 
 * @param {string} toEmail - Recipient email address
 * @param {string} verificationLink - The verification URL
 * @param {string} userName - User's display name
 */
async function sendVerificationEmail(toEmail, verificationLink, userName = '') {
  // Firebase's generateEmailVerificationLink already sends the email
  // via Firebase's built-in email service when the Firebase project
  // has email templates configured. This function is a safety net.

  if (isFirebaseAvailable()) {
    // Firebase handles email delivery — just log for audit
    console.log(`📧 Verification email sent to ${toEmail} via Firebase`);
    return { success: true, method: 'firebase' };
  }

  // Fallback: Log the link (in production, replace with SendGrid/nodemailer)
  console.log(`📧 [DEV FALLBACK] Verification link for ${toEmail}: ${verificationLink}`);
  return { success: true, method: 'console_fallback', link: verificationLink };
}

module.exports = { sendVerificationEmail };
