import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send login credentials to a newly registered pet owner.
 */
export async function sendOwnerCredentials({ toEmail, ownerName, password }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP_USER/SMTP_PASS not set — skipping credential email to', toEmail);
    return;
  }

  const from = process.env.SMTP_FROM ?? `"DIGIVET - Lipa City Veterinary Office" <${process.env.SMTP_USER}>`;
  const loginUrl = process.env.ONLINE_APP_URL ?? 'http://localhost:5173';

  const transport = createTransport();

  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'DIGIVET – Your Pet Records Account is Ready',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#1a6a3a">Welcome to DIGIVET, ${ownerName}!</h2>
        <p>The Lipa City Veterinary Office has created an online account for you so you can view your pets and their vaccination records anytime.</p>
        <p><strong>Your login details:</strong></p>
        <table style="background:#f4f8f5;border-radius:8px;padding:16px 24px;margin:16px 0;width:100%;border-collapse:collapse">
          <tr><td style="color:#555;padding:6px 12px 6px 0;white-space:nowrap">Account</td><td style="padding:6px 0"><strong>${toEmail}</strong></td></tr>
          <tr><td style="color:#555;padding:6px 12px 6px 0;white-space:nowrap">Access code</td><td style="padding:6px 0"><strong style="font-size:1.1em;letter-spacing:1px">${password}</strong></td></tr>
        </table>
        <a href="${loginUrl}" style="display:inline-block;background:#1a6a3a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">
          View My Pets
        </a>
        <p style="margin-top:28px;color:#888;font-size:12px;line-height:1.6">
          This message was sent by the Lipa City Veterinary Office (DIGIVET system).<br>
          If you did not expect this, please disregard.
        </p>
      </div>
    `,
    text:
      `Welcome to DIGIVET, ${ownerName}!\n\n` +
      `The Lipa City Veterinary Office has created an account for you.\n\n` +
      `Account:     ${toEmail}\n` +
      `Access code: ${password}\n\n` +
      `Log in at: ${loginUrl}\n\n` +
      `Sent by the Lipa City Veterinary Office (DIGIVET).`,
  });
}
