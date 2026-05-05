import nodemailer from "nodemailer";
import { logger } from "./logger";

const SMTP_HOST = process.env["SMTP_HOST"] || "smtp.gmail.com";
const SMTP_PORT = Number(process.env["SMTP_PORT"] || 465);
const SMTP_USER = process.env["SMTP_USER"] || "";
const SMTP_PASS = process.env["SMTP_PASS"] || process.env["GMAIL_APP_PASSWORD"] || "";
const FROM_ADDRESS = process.env["SMTP_FROM"] || process.env["EMAIL_FROM"] || `"Athoo" <${SMTP_USER}>`;

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; channel: "smtp" | "console" }> {
  const transport = getTransport();
  if (!transport) {
    // Dev / unconfigured — log instead of failing so the app still works.
    logger.info({ to: args.to, subject: args.subject }, "[email:console] (no SMTP_PASS configured)");
    if (process.env["NODE_ENV"] !== "production") {
      logger.debug({ to: args.to, subject: args.subject, body: args.text || args.html }, "[email:console] (dev mode)");
    }
    return { ok: true, channel: "console" };
  }
  try {
    await transport.sendMail({
      from: FROM_ADDRESS,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, channel: "smtp" };
  } catch (e) {
    logger.error({ err: e, to: args.to }, "email send failed");
    return { ok: false, channel: "smtp" };
  }
}

export function renderOtpEmail(code: string, purpose = "Verification"): { html: string; text: string; subject: string } {
  const subject = `${purpose} code: ${code}`;
  const text = `Your Athoo ${purpose.toLowerCase()} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#F4F6FB;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.06)">
        <h1 style="margin:0 0 8px;color:#1A6EE0;font-size:22px">Athoo</h1>
        <p style="margin:0 0 24px;color:#475569">Pakistani service marketplace</p>
        <h2 style="margin:0 0 8px;color:#0F172A;font-size:18px">${purpose} code</h2>
        <p style="margin:0 0 16px;color:#475569">Use this code to continue. It expires in 10 minutes.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0F172A;background:#F1F5F9;border-radius:12px;padding:18px;text-align:center">${code}</div>
        <p style="margin:24px 0 0;color:#94A3B8;font-size:12px">If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>`;
  return { subject, html, text };
}

