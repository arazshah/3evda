/**
 * Links for contact details typed by anonymous visitors. Unlike the owner's own settings, these values
 * are not trusted: a link is made only when the text really is a Telegram handle or a phone number,
 * so a visitor cannot put an arbitrary address (or a script URL) behind a «Telegram» or «WhatsApp» label.
 */

const TELEGRAM_HANDLE = /^@?([A-Za-z0-9_]{3,64})$/;
const PHONE_NUMBER = /^\+?[\d\s()-]{5,20}$/;

export function telegramLink(value: string): string | null {
  const match = TELEGRAM_HANDLE.exec(value.trim());
  return match ? `https://t.me/${match[1]}` : null;
}

export function whatsappLink(value: string): string | null {
  const text = value.trim();
  if (!PHONE_NUMBER.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
