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
