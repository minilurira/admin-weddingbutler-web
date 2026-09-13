"use client";

import { useEffect, useState } from "react";

function measureWidth() {
  const el = document.documentElement;
  const b = document.body;
  const candidates = [window.innerWidth, el?.clientWidth, b?.clientWidth].filter(
    (n): n is number => typeof n === "number" && n > 0
  );
  return candidates.length ? Math.min(...candidates) : 1200;
}

export function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(measureWidth() < breakpoint);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    let ro: ResizeObserver | undefined;
    if (window.ResizeObserver && document.body) {
      ro = new ResizeObserver(update);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      ro?.disconnect();
    };
  }, [breakpoint]);

  return isMobile;
}
