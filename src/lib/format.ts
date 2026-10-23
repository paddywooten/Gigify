// Money formatting + small shared helpers.

import { CURRENCY } from "./constants";

/**
 * Formats an integer minor-unit amount in the platform currency (GHS),
 * e.g. 125000 -> "GH₵1,250.00".
 */
export function formatMoney(cents: number, currency = CURRENCY): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Formats a commission rate (0.15 -> "15%"). */
export function formatRate(rate: number): string {
  return `${(rate * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(date: string | Date): string {
  const then = new Date(date).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}
