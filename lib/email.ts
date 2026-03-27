export async function sendInviteEmail(
  recipientEmail: string,
  inviterName: string,
  shadowPlayerName: string,
  matchCount: number,
  inviteUrl: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    console.log(`[email] Invite URL for ${recipientEmail}:\n  ${inviteUrl}`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Vector by Vektra <noreply@yourdomain.com>",
    to: recipientEmail,
    subject: `${inviterName} invites you to join Vector and see your pickleball stats`,
    html: `
      <p>${inviterName} played with you and entered the match into Vector app.</p>
      <p>${shadowPlayerName}'s profile has ${matchCount} match${matchCount === 1 ? "" : "es"} tracked — including rating and win history.</p>
      <p><a href="${inviteUrl}">Claim your stats →</a></p>
      <p style="font-size:12px;color:#71717a;">This invite was sent by ${inviterName} via Vector. Link expires in 30 days. — vector.app</p>
    `,
  });
}

export async function sendInviteClaimedEmail(
  inviterEmail: string,
  inviterName: string,
  claimedPlayerName: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    console.log(`[email] Invite claimed notification for ${inviterEmail}: ${claimedPlayerName} claimed their profile.`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Vector by Vektra <noreply@yourdomain.com>",
    to: inviterEmail,
    subject: `Good news — ${claimedPlayerName} joined Vector!`,
    html: `
      <p>${claimedPlayerName} claimed their profile.</p>
      <p>${claimedPlayerName} joined Vector and linked the shadow profile you shared. Thank you!</p>
      <p><a href="${baseUrl}/command">View stats →</a></p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    console.log(`[email] Password reset URL for ${email}:\n  ${resetUrl}`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Vector by Vektra <noreply@yourdomain.com>",
    to: email,
    subject: "Reset your Vector password",
    html: `
      <p>You requested a password reset for your Vector by Vektra account.</p>
      <p>Click the link below to set a new password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>If you didn't request this, you can ignore this email — your password won't change.</p>
    `,
  });
}

export async function sendVerificationEmail(email: string, rawToken: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;

  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured.");
    }
    // Development fallback: log to console so the developer can verify manually
    console.log(`[email] Verification URL for ${email}:\n  ${verifyUrl}`);
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Vector by Vektra <noreply@yourdomain.com>",
    to: email,
    subject: "Verify your Vector account",
    html: `
      <p>Thanks for signing up for Vector by Vektra.</p>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p>If you didn't create an account, you can ignore this email.</p>
    `,
  });
}
