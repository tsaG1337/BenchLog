import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Derives the thumbnail URL for a given image URL.
 * e.g. /files/abc123.jpg → /files/abc123_thumb.jpg
 * Falls back to the original URL for images uploaded before thumbnail support.
 */
/** Append auth token to local file URLs so <img> tags can authenticate */
function authUrl(url: string): string {
  if (!url.startsWith('/files/') && !url.startsWith('/receipts/')) return url;
  const token = localStorage.getItem('auth_token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${token}`;
}

export function thumbUrl(url: string): string {
  const thumbed = url.replace(/\.(jpe?g|png|webp)$/, '_thumb.$1');
  return authUrl(thumbed);
}

/** Authenticate a full-size image URL for local file serving */
export function imageUrl(url: string): string {
  return authUrl(url);
}

// ─── Category split utilities ──────────────────────────────────────
// Format: "cat1:60,cat2:40" (percentages) or "cat1,cat2" (equal split, legacy)
// Single category: "cat1" (100%)

export interface CategorySplit { id: string; pct: number }

/** Parse a category string into splits with percentages (always summing to 100) */
export function parseCategorySplits(category: string): CategorySplit[] {
  if (!category) return [{ id: 'other', pct: 100 }];
  const parts = category.split(',').map(p => p.trim()).filter(Boolean);
  const hasWeights = parts.some(p => p.includes(':'));
  if (!hasWeights) {
    // Equal split (legacy format or single category)
    const pct = Math.round(10000 / parts.length) / 100;
    const splits = parts.map(id => ({ id, pct }));
    // Give last item the remainder so they sum to exactly 100
    if (splits.length > 1) {
      splits[splits.length - 1].pct = 100 - splits.slice(0, -1).reduce((s, c) => s + c.pct, 0);
    }
    return splits;
  }
  const splits = parts.map(p => {
    const [id, w] = p.split(':');
    return { id: id.trim(), pct: Math.max(0, parseFloat(w) || 0) };
  });
  // Normalize so they sum to exactly 100
  const total = splits.reduce((s, c) => s + c.pct, 0);
  if (total > 0) {
    splits.forEach(s => s.pct = s.pct / total * 100);
  }
  return splits;
}

/** Serialize splits back to the category string */
export function serializeCategorySplits(splits: CategorySplit[]): string {
  if (splits.length === 0) return 'other';
  if (splits.length === 1) return splits[0].id;
  const isEqual = splits.every(s => Math.abs(s.pct - splits[0].pct) < 0.5);
  if (isEqual) return splits.map(s => s.id).join(',');
  return splits.map(s => `${s.id}:${s.pct}`).join(',');
}

/** Get the category IDs from a category string (ignoring weights) */
export function getCategoryIds(category: string): string[] {
  return parseCategorySplits(category).map(s => s.id);
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
