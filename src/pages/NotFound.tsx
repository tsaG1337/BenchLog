import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = "Wrong heading — page not found";
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
          404 — wrong heading
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
          This page never made it<br />out of the hangar.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Either the URL is misspelled, this logbook entry has been retired to
          a dusty hangar somewhere, or you followed a link to something that
          never got riveted into the build.
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          The rest of the build log is still flying though &mdash;
          head back and pick something else to read.
        </p>
        <a
          href="/blog"
          className="inline-block bg-primary hover:bg-primary/80 text-primary-foreground font-semibold px-8 py-3 rounded-lg text-sm transition-colors"
        >
          Back to the build log &rarr;
        </a>
      </div>
    </div>
  );
};

export default NotFound;
