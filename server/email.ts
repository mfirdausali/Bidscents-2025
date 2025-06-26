import nodemailer from 'nodemailer';
import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'BidScents Security <security@bidscents.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '')
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Email (dev mode):', mailOptions);
      return;
    }

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${options.to}`);
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

/**
 * Send security alert to all admins
 */
export async function sendSecurityAlertToAdmins(alert: {
  type: string;
  severity: string;
  title: string;
  description: string;
}): Promise<void> {
  try {
    // Get all admin users
    const admins = await db.select()
      .from(users)
      .where(eq(users.role, 'admin'));

    // Send email to each admin
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `[${alert.severity.toUpperCase()}] Security Alert: ${alert.title}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; }
              .severity-critical { color: #dc3545; }
              .severity-high { color: #fd7e14; }
              .severity-medium { color: #ffc107; }
              .severity-low { color: #0dcaf0; }
              .content { margin: 20px 0; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Security Alert</h2>
                <p class="severity-${alert.severity}">Severity: ${alert.severity.toUpperCase()}</p>
              </div>
              
              <div class="content">
                <h3>${alert.title}</h3>
                <p>${alert.description}</p>
                <p><strong>Alert Type:</strong> ${alert.type}</p>
                <p><strong>Time:</strong> ${new Date().toISOString()}</p>
              </div>
              
              <div class="footer">
                <p>Please check the security dashboard for more details and to acknowledge this alert.</p>
                <p><a href="${process.env.APP_URL}/admin/security">View Security Dashboard</a></p>
              </div>
            </div>
          </body>
          </html>
        `
      });
    }
  } catch (error) {
    console.error('Error sending security alert emails:', error);
  }
}