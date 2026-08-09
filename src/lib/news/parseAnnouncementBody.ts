/**
 * Parses the admin-authored announcement body into bullets.
 *
 * The format is deliberately not markdown: one bullet per line, and an
 * optional "Label - rest of the line" shape that renders the label in
 * bold. That covers the layout we actually want without asking an admin
 * to hand-write markup into a small textarea, and without pulling a
 * renderer + sanitiser into the dialog.
 */

export interface AnnouncementBullet {
  /** Bolded lead-in, or null when the line has no "Label - text" shape. */
  label: string | null;
  text: string;
}

// A label is a short noun phrase ("Favorites", "View File Activity"),
// not a clause. Length alone isn't enough to tell them apart — "We
// rewrote how plan sheets zoom" is only 30 characters — so cap the word
// count too, which is what actually distinguishes the two.
const MAX_LABEL_LENGTH = 40;
const MAX_LABEL_WORDS = 4;

/** Hyphen, en dash or em dash, surrounded by whitespace. */
const SEPARATOR = /\s+[-–—]\s+/;

export function parseAnnouncementBody(body: string | undefined | null): AnnouncementBullet[] {
  if (!body) return [];
  return body
    .split('\n')
    .map(line => line.trim())
    // Tolerate the admin typing markdown-ish bullets out of habit.
    .map(line => line.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(SEPARATOR);
      if (!match || match.index === undefined) return { label: null, text: line };
      const label = line.slice(0, match.index).trim();
      const text = line.slice(match.index + match[0].length).trim();
      // A "label" that's a whole sentence, or that leaves nothing after
      // the dash, means the dash was punctuation rather than a
      // separator — keep the line whole in that case.
      if (
        !label || !text ||
        label.length > MAX_LABEL_LENGTH ||
        label.split(/\s+/).length > MAX_LABEL_WORDS ||
        /[.!?]$/.test(label)
      ) {
        return { label: null, text: line };
      }
      return { label, text };
    });
}
