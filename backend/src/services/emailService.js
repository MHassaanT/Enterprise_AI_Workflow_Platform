// src/services/emailService.js
// Multi-provider email service for sending verification emails.
// Supports SMTP (Nodemailer), SendGrid, Resend, or fallback link generation.

const axios = require('axios');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

/**
 * Send a verification email to the user.
 * 
 * @param {string} toEmail - Recipient email address
 * @param {string} verificationLink - The verification URL
 * @param {string} userName - User's display name
 * @returns {Promise<{ success: boolean, method: string, link?: string }>}
 */
async function sendVerificationEmail(toEmail, verificationLink, userName = '') {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@enterprise-ai-platform.com';
  const nameDisplay = userName ? `Hello ${userName},\n\n` : 'Hello,\n\n';
  
  const emailSubject = 'Verify your Enterprise AI Platform account';
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
      <h2 style="color: #1e293b;">Welcome to Enterprise AI Platform</h2>
      <p>${nameDisplay}Please verify your email address to complete your organization setup and choose your subscription plan.</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${verificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #64748b; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="color: #2563eb; font-size: 12px; word-break: break-all;">${verificationLink}</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">If you did not request this account, please ignore this email.</p>
    </div>
  `;

  // 1. Send via Resend API if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: fromEmail,
          to: [toEmail],
          subject: emailSubject,
          html: emailHtml,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`📧 Verification email sent to ${toEmail} via Resend API`);
      return { success: true, method: 'resend' };
    } catch (err) {
      console.error('❌ Resend email dispatch failed:', err.response?.data || err.message);
    }
  }

  // 2. Send via SendGrid API if SENDGRID_API_KEY is configured
  if (process.env.SENDGRID_API_KEY) {
    try {
      await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        {
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: fromEmail },
          subject: emailSubject,
          content: [{ type: 'text/html', value: emailHtml }],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`📧 Verification email sent to ${toEmail} via SendGrid API`);
      return { success: true, method: 'sendgrid' };
    } catch (err) {
      console.error('❌ SendGrid email dispatch failed:', err.response?.data || err.message);
    }
  }

  // 3. Send via SMTP / Nodemailer if configured
  if (nodemailer && (process.env.SMTP_HOST || process.env.SMTP_USER)) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log(`📧 Verification email sent to ${toEmail} via Nodemailer SMTP`);
      return { success: true, method: 'smtp' };
    } catch (err) {
      console.error('❌ Nodemailer SMTP dispatch failed:', err.message);
    }
  }

  // 4. Fallback: Log link and return it for UI fallback
  console.log(`📧 [FALLBACK] Email service not configured/failed. Verification link for ${toEmail}: ${verificationLink}`);
  return { success: false, method: 'fallback', link: verificationLink };
}

module.exports = { sendVerificationEmail };
