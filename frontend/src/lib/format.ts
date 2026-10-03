const faNumber = new Intl.NumberFormat("fa-IR");
const faDecimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return faNumber.format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${faNumber.format(bytes)} بایت`;
  const units = ["کیلوبایت", "مگابایت", "گیگابایت"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${faDecimal.format(value)} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${faNumber.format(m)}:${faNumber.format(s).padStart(2, "۰")}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
