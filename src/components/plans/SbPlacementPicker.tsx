/**
 * Admin coordinate-picker dialog.
 *
 * Triggered when an admin clicks on a plan page while in 'place-sb' mode.
 * Shows the captured (x, y, page), lets them pick an SB from the catalog
 * or author a brand-new one inline, and outputs a code snippet ready to
 * paste into the catalog file.
 *
 * Two snippet flavours:
 *  • Existing SB selected: just the placement object (paste into the SB's
 *    `placements: [...]` array).
 *  • "+ Create new SB..." selected: full ServiceBulletin entry with the
 *    captured coords pre-filled in its `placements` array (paste at the
 *    top of VANS_RV10_SERVICE_BULLETINS).
 *
 * Also supports "Stage locally" for existing SBs — saves the placement to
 * localStorage so the admin can preview it before committing the code
 * change. Staging is disabled when authoring a new SB, since there's no
 * catalog entry to anchor the staged marker to until after deploy.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { listAllServiceBulletins } from '@/lib/aircraft';
import type { ServiceBulletin, SbPlacement, SbStatus } from '@/lib/aircraft';

interface Props {
  open: boolean;
  onClose: () => void;
  aircraftSlug: string;
  sectionId: string;
  pickerCoords: { x: number; y: number; page: number };
  onStaged: (entry: { sb: ServiceBulletin; placement: SbPlacement }) => void;
}

const NEW_SB_SENTINEL = '__new__';

type NewSbDraft = {
  sbId: string;
  title: string;
  description: string;
  status: SbStatus;
  url: string;
};

const EMPTY_DRAFT: NewSbDraft = {
  sbId: '',
  title: '',
  description: '',
  status: 'action-required',
  url: '',
};

export function SbPlacementPicker({
  open, onClose, aircraftSlug, sectionId, pickerCoords, onStaged,
}: Props) {
  const allSbs = useMemo(() => listAllServiceBulletins(aircraftSlug), [aircraftSlug]);
  const [selectedSbId, setSelectedSbId] = useState<string>('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<NewSbDraft>(EMPTY_DRAFT);

  const isCreatingNew = selectedSbId === NEW_SB_SENTINEL;
  const selected = !isCreatingNew ? allSbs.find(sb => sb.sbId === selectedSbId) : undefined;

  const placement: SbPlacement = {
    sectionId,
    page: pickerCoords.page,
    x: round4(pickerCoords.x),
    y: round4(pickerCoords.y),
    ...(note.trim() ? { note: note.trim() } : {}),
  };

  // Validation for the new-SB form: all required fields filled + sbId
  // doesn't collide with an existing catalog entry.
  const draftIdCollision = isCreatingNew
    && !!draft.sbId.trim()
    && allSbs.some(sb => sb.sbId.toUpperCase() === draft.sbId.trim().toUpperCase());
  const draftValid = isCreatingNew
    && !!draft.sbId.trim()
    && !!draft.title.trim()
    && !!draft.description.trim()
    && !!draft.url.trim()
    && !draftIdCollision;

  const snippet = isCreatingNew
    ? draftValid ? formatNewSbSnippet(draft, placement) : ''
    : formatPlacementSnippet(placement);

  const canCopy = isCreatingNew ? draftValid : !!selected;
  const canStage = !!selected; // only for existing SBs

  const handleStage = () => {
    if (!selected) return;
    onStaged({ sb: selected, placement });
    toast.success('Placement staged locally — visible until you reload or clear it.');
    onClose();
  };

  const handleCopy = async () => {
    if (!snippet) return;
    const ok = await copyToClipboard(snippet);
    if (ok) {
      toast.success(
        isCreatingNew
          ? 'New SB snippet copied. Paste at the top of VANS_RV10_SERVICE_BULLETINS, then deploy.'
          : 'Snippet copied to clipboard. Paste into the SB\'s placements array.',
      );
    } else {
      toast.error('Copy failed — select the snippet in the preview above and copy manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Place Service Bulletin marker</DialogTitle>
        </DialogHeader>

        {/* min-w-0 lets the children (inputs, <pre>) shrink instead of
            pushing the dialog wider when content (like a long URL) would
            otherwise exceed the dialog's max-w. */}
        <div className="space-y-3 min-w-0">
          <div className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1.5">
            sectionId: {sectionId} · page: {pickerCoords.page} · x: {round4(pickerCoords.x)} · y: {round4(pickerCoords.y)}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Select SB from catalog</label>
            <select
              value={selectedSbId}
              onChange={e => setSelectedSbId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm"
            >
              <option value="">— pick an SB —</option>
              {allSbs.map(sb => (
                <option key={sb.sbId} value={sb.sbId}>
                  {sb.sbId} — {sb.title}
                </option>
              ))}
              <option value={NEW_SB_SENTINEL}>+ Create new SB…</option>
            </select>
          </div>

          {isCreatingNew && (
            <div className="space-y-2 border border-dashed border-amber-500/40 rounded-md p-3 bg-amber-500/5">
              <p className="text-[11px] text-muted-foreground">
                Fill in the SB metadata. The snippet below will include this entry
                plus the captured placement, ready to paste into
                <code className="mx-1">service-bulletins.ts</code>.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">SB ID</label>
                  <input
                    type="text"
                    value={draft.sbId}
                    onChange={e => setDraft({ ...draft, sbId: e.target.value })}
                    placeholder="SB-22-05-12"
                    className={`w-full px-2 py-1.5 rounded-md bg-card border text-sm ${draftIdCollision ? 'border-destructive' : 'border-border'}`}
                  />
                  {draftIdCollision && (
                    <p className="text-[10px] text-destructive mt-0.5">Already in catalog</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Status</label>
                  <select
                    value={draft.status}
                    onChange={e => setDraft({ ...draft, status: e.target.value as SbStatus })}
                    className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm"
                  >
                    <option value="action-required">Action required (yellow)</option>
                    <option value="incorporated">Incorporated (green)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Title</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Short headline shown in the popover"
                  className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <textarea
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="2-4 sentences explaining what the SB requires."
                  rows={3}
                  className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm resize-y"
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block">Link to Van's SB page</label>
                <input
                  type="url"
                  value={draft.url}
                  onChange={e => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://vansaircraft.com/..."
                  className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium mb-1 block">Note for this placement (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. between Step 4 and Step 5"
              className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-sm"
            />
          </div>

          {snippet && (
            <div className="min-w-0">
              <label className="text-xs font-medium mb-1 block">
                {isCreatingNew
                  ? 'Snippet (paste at the top of VANS_RV10_SERVICE_BULLETINS)'
                  : 'Snippet (paste into placements: [...])'}
              </label>
              <pre className="text-[11px] bg-muted/40 rounded px-2 py-2 overflow-x-auto whitespace-pre max-w-full">
{snippet}
              </pre>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={handleStage} disabled={!canStage}
              title={isCreatingNew ? 'Staging only works for existing catalog entries — deploy the new SB first.' : undefined}>
              Stage locally
            </Button>
            <Button size="sm" onClick={handleCopy} disabled={!canCopy}>
              Copy snippet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * navigator.clipboard.writeText requires a secure context (HTTPS or
 * localhost). When the app is reached via an HTTP LAN IP (e.g. running
 * the dev server from another machine on the local network) the modern
 * API throws, so we fall back to the legacy textarea + execCommand trick
 * which works in any context where the page is focused.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatPlacementSnippet(p: SbPlacement): string {
  const parts = [
    `sectionId: '${p.sectionId}'`,
    `page: ${p.page}`,
    `x: ${p.x}`,
    `y: ${p.y}`,
  ];
  if (p.note) parts.push(`note: ${JSON.stringify(p.note)}`);
  return `{ ${parts.join(', ')} },`;
}

/** Full ServiceBulletin object snippet with one placement pre-filled. */
function formatNewSbSnippet(draft: NewSbDraft, placement: SbPlacement): string {
  // JSON.stringify on each string so quotes, backslashes, and unicode
  // round-trip safely into a TypeScript string literal.
  const lines = [
    '{',
    `  sbId: ${JSON.stringify(draft.sbId.trim())},`,
    `  title: ${JSON.stringify(draft.title.trim())},`,
    `  description: ${JSON.stringify(draft.description.trim())},`,
    `  status: '${draft.status}',`,
    `  url: ${JSON.stringify(draft.url.trim())},`,
    `  placements: [`,
    `    ${formatPlacementSnippet(placement)}`,
    `  ],`,
    '},',
  ];
  return lines.join('\n');
}
