import { Resend } from 'resend';
import Mailjet from 'node-mailjet';

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'resend';
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@suyogjadhav.online';

let resendClient: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
}

let mailjetClient: any = null;
if (process.env.MJ_APIKEY_PUBLIC && process.env.MJ_APIKEY_PRIVATE) {
  mailjetClient = Mailjet.apiConnect(
    process.env.MJ_APIKEY_PUBLIC,
    process.env.MJ_APIKEY_PRIVATE
  );
}

interface InviteEmailOptions {
  to: string;
  playerName: string;
  eventName: string;
  accessCode: string;
  loginUrl: string;
}

/**
 * Send a player invite email with their one-time access code.
 * The plaintext access code is ONLY ever in this email — never stored server-side.
 */
export async function sendInviteEmail(opts: InviteEmailOptions): Promise<void> {
  const { to, playerName, eventName, accessCode, loginUrl } = opts;
  const subject = `You're invited to ${eventName}`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #111; border: 1px solid #00ff41; padding: 32px; border-radius: 4px; }
    h1 { color: #00ff41; font-size: 22px; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    .code-box { background: #000; border: 1px solid #00ff41; border-radius: 4px; padding: 20px; margin: 24px 0; text-align: center; }
    .code { font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #00ff41; font-family: monospace; }
    .code-label { font-size: 11px; color: #555; margin-top: 8px; }
    .button { display: inline-block; background: #00ff41; color: #000; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-weight: bold; font-size: 16px; margin: 16px 0; }
    .warning { background: #1a1a00; border-left: 3px solid #ff0; padding: 12px 16px; font-size: 13px; color: #cc0; margin-top: 24px; }
    .footer { font-size: 11px; color: #444; margin-top: 32px; border-top: 1px solid #222; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>// ACCESS GRANTED</h1>
    <div class="subtitle">You have been invited to participate in <strong style="color:#fff">${eventName}</strong></div>
    
    <p>Hello ${playerName},</p>
    <p>Your access code for the competition is:</p>
    
    <div class="code-box">
      <div class="code">${accessCode}</div>
      <div class="code-label">Single-use access code — keep this private</div>
    </div>
    
    <p style="text-align:center">
      <a href="${loginUrl}" class="button">→ Login to the Platform</a>
    </p>
    
    <div class="warning">
      ⚠ Do not share this code. Each participant has a unique code.
      Sharing codes may trigger suspicious activity detection and result in disqualification.
    </div>
    
    <div class="footer">
      If you did not expect this invitation, you can safely ignore this email.<br/>
      This code cannot be used without your registered email address.
    </div>
  </div>
</body>
</html>
  `.trim();

  if (EMAIL_PROVIDER === 'mailjet') {
    if (!mailjetClient) {
      throw new Error('Mailjet client not initialized. Make sure MJ_APIKEY_PUBLIC and MJ_APIKEY_PRIVATE are set.');
    }
    await mailjetClient.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: FROM_EMAIL,
            Name: 'CTF Platform',
          },
          To: [
            {
              Email: to,
              Name: playerName,
            },
          ],
          Subject: subject,
          HTMLPart: htmlContent,
        },
      ],
    });
  } else {
    if (!resendClient) {
      throw new Error('Resend client not initialized. Make sure RESEND_API_KEY is set.');
    }
    await resendClient.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: htmlContent,
    });
  }
}

/**
 * Send a support ticket reply notification to a player.
 */
export async function sendTicketReplyEmail(opts: {
  to: string;
  playerName: string;
  ticketSubject: string;
  replyMessage: string;
  platformUrl: string;
}): Promise<void> {
  const { to, playerName, ticketSubject, replyMessage, platformUrl } = opts;
  const subject = `Re: ${ticketSubject}`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />
<style>
  body { font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: auto; background: #111; border: 1px solid #333; padding: 28px; border-radius: 4px; }
  h2 { color: #00ff41; }
  .message { background: #1a1a1a; border-left: 3px solid #00ff41; padding: 14px; margin: 16px 0; border-radius: 2px; white-space: pre-wrap; }
  a { color: #00ff41; }
</style>
</head>
<body>
<div class="container">
  <h2>// Support Reply</h2>
  <p>Hi ${playerName},</p>
  <p>Your support ticket "<strong>${ticketSubject}</strong>" has received a reply:</p>
  <div class="message">${replyMessage}</div>
  <p><a href="${platformUrl}/support">View full ticket thread →</a></p>
</div>
</body>
</html>
  `.trim();

  if (EMAIL_PROVIDER === 'mailjet') {
    if (!mailjetClient) {
      throw new Error('Mailjet client not initialized. Make sure MJ_APIKEY_PUBLIC and MJ_APIKEY_PRIVATE are set.');
    }
    await mailjetClient.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: FROM_EMAIL,
            Name: 'CTF Platform',
          },
          To: [
            {
              Email: to,
              Name: playerName,
            },
          ],
          Subject: subject,
          HTMLPart: htmlContent,
        },
      ],
    });
  } else {
    if (!resendClient) {
      throw new Error('Resend client not initialized. Make sure RESEND_API_KEY is set.');
    }
    await resendClient.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: htmlContent,
    });
  }
}
