export default function SubdomainNotFoundPage() {
  const parts = window.location.hostname.split('.');
  const homeUrl = parts.length >= 3
    ? `https://${parts.slice(1).join('.')}`
    : '/';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          Build log not found
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
          These rivets haven't been<br />squeezed yet.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          There's no build log at{' '}
          <span className="font-mono text-foreground">{window.location.hostname}</span>.
          Every builder starts somewhere, though.
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          This URL is unclaimed. It could be yours. Start your own build log and
          share every hour of your project with the world.
        </p>
        <a
          href={homeUrl}
          className="inline-block bg-primary hover:bg-primary/80 text-primary-foreground font-semibold px-8 py-3 rounded-lg text-sm transition-colors"
        >
          Start your build log →
        </a>
      </div>
    </div>
  );
}
