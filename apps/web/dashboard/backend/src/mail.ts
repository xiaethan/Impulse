import nodemailer from "nodemailer";

export type Delivery = "email" | "log";

export async function sendConfirmationCode(email: string, code: string): Promise<Delivery> {
  const host = process.env.SMTP_HOST;
  const text = `Your Impulse confirmation code is ${code}. It expires in 10 minutes.`;
  if (!host) {
    console.log(`Confirmation code for ${email}: ${code}`);
    return "log";
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Impulse <noreply@localhost>",
    to: email,
    subject: "Your Impulse confirmation code",
    text,
  });
  return "email";
}
