/**
 * "What's new" announcement — shown once per published news item.
 *
 * The nav rail's What's New badge is easy to miss, so a genuinely
 * notable release gets a dialog on the first app load after it's
 * published. Dismissing it marks the item seen, which also clears the
 * badge; the nav item stays so the post can be re-read later.
 *
 * Content comes from the admin panel's Latest News form. The body is a
 * plain list of lines rather than markup — see parseAnnouncementBody.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
// lucide rather than MIcon: MIcon lives in AppShell, which mounts this
// component — importing it back would close an import cycle.
import { Megaphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/contexts/OnboardingContext';
import { parseAnnouncementBody } from '@/lib/news/parseAnnouncementBody';

export function NewsAnnouncementDialog() {
  const { isAuthenticated, demoMode, latestNews, hasUnseenNews, markNewsSeen } = useAuth();
  const { status } = useOnboardingStatus();
  // Local, so dismissing closes instantly rather than waiting on the
  // markNewsSeen round-trip — and so re-renders can't reopen it.
  const [dismissed, setDismissed] = useState(false);

  // A fresh news item should be able to interrupt a session that's
  // already open, not just a cold load.
  useEffect(() => { setDismissed(false); }, [latestNews?.slug]);

  const bullets = parseAnnouncementBody(latestNews?.body);

  // Never talk over onboarding: a brand-new builder working through the
  // welcome wizard doesn't need to hear what changed since last time.
  // `status === null` means the check is still in flight — wait rather
  // than risk stacking two dialogs.
  const onboardingSettled = status?.wizardCompleted === true;

  const open =
    isAuthenticated && !demoMode && !dismissed && onboardingSettled &&
    !!hasUnseenNews && !!latestNews?.slug &&
    // Nothing to say without a body or intro — the badge alone covers
    // "there's a post", and an empty modal is worse than no modal.
    (bullets.length > 0 || !!latestNews.intro);

  if (!open || !latestNews) return null;

  const newsUrl = `https://benchlog.build/news/${encodeURIComponent(latestNews.slug)}/`;
  const close = () => {
    setDismissed(true);
    void markNewsSeen();
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug pr-6">
            {latestNews.title || 'What’s new'}
          </DialogTitle>
        </DialogHeader>

        {latestNews.intro && (
          <p className="text-sm text-muted-foreground -mt-1">{latestNews.intro}</p>
        )}

        {bullets.length > 0 && (
          <div className="flex gap-4 mt-2">
            <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" />
            </div>
            <ul className="space-y-3 min-w-0">
              {bullets.map((b, i) => (
                <li key={i} className="text-sm text-foreground leading-relaxed">
                  {b.label && <span className="font-semibold">{b.label}</span>}
                  {b.label && ' — '}
                  <span className={b.label ? 'text-muted-foreground' : undefined}>{b.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-border">
          <a
            href={newsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="text-sm text-primary hover:underline"
          >
            Read the full post
          </a>
          <Button size="sm" onClick={close}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
