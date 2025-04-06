import nodemailer from "nodemailer";

// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.ethereal.email", // Default to Ethereal for testing
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASSWORD || "",
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Sends an email using the configured transporter
 */
export async function sendEmail({ to, subject, text, html }: EmailOptions): Promise<boolean> {
  try {
    // If no email credentials are set, create a test account
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log("No email credentials provided, using Ethereal test account...");
      const testAccount = await nodemailer.createTestAccount();
      
      transporter.options.auth = {
        user: testAccount.user,
        pass: testAccount.pass,
      };
      
      console.log(`Using test account: ${testAccount.user}`);
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || `"Essence Perfumes" <noreply@essenceperfumes.com>`,
      to,
      subject,
      text,
      html,
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // If using Ethereal (test account), log the URL to view the email
    if (info.messageId && !process.env.EMAIL_USER) {
      console.log(`Email sent: ${info.messageId}`);
      console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

/**
 * Sends a password reset email with verification code
 */
export async function sendPasswordResetEmail(
  email: string, 
  resetCode: string,
  expiryHours: number
): Promise<boolean> {
  const subject = "Password Reset Request";
  
  const text = `
    Hello,
    
    You recently requested to reset your password. Use the following verification code to complete the process:
    
    ${resetCode}
    
    This code will expire in ${expiryHours} hours.
    
    If you did not request a password reset, please ignore this email.
    
    Best regards,
    Essence Perfumes Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6941C6;">Password Reset Request</h2>
      <p>Hello,</p>
      <p>You recently requested to reset your password. Use the following verification code to complete the process:</p>
      <div style="margin: 20px 0; padding: 15px; background-color: #f8f4ff; border-radius: 4px; text-align: center;">
        <span style="font-size: 24px; letter-spacing: 5px; font-weight: bold; color: #6941C6;">${resetCode}</span>
      </div>
      <p>This code will expire in <strong>${expiryHours} hours</strong>.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">If you did not request a password reset, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">Essence Perfumes - Premium Secondhand Perfume Marketplace</p>
    </div>
  `;
  
  return sendEmail({ to: email, subject, text, html });
}