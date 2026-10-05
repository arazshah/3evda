import { splashPending } from "@/lib/splash.server";
import { SplashSeen } from "./SplashSeen";

/**
 * The first-visit intro: an ink curtain with the brand name rising out of a mask, a hairline filling beneath it,
 * then the curtain lifts. CSS only (see `.splash` in globals.css), decorative (hidden from assistive technology),
 * skipped under reduced motion, and never rendered again once the visitor has seen it.
 */
export async function Splash({ brand, tagline }: { brand: string; tagline: string }) {
  if (!(await splashPending())) return null;
  return (
    <>
      <div className="splash" aria-hidden="true">
        <div className="splash-inner">
          {tagline ? <p className="eyebrow splash-tag">{tagline}</p> : null}
          <p className="font-display splash-name">
            <span>{brand}</span>
          </p>
          <div className="splash-line">
            <span />
          </div>
        </div>
      </div>
      <SplashSeen />
    </>
  );
}
