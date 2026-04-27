"use client";

import { useEffect, useRef } from "react";

interface AdSlotProps {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Label shown inside the placeholder */
  label?: string;
  /** Extra Tailwind classes */
  className?: string;
  /** The specific Adsterra key for this ad unit */
  adKey?: string;
  /** The Adsterra invoke domain (changes to bypass adblockers) */
  adDomain?: string;
}

/**
 * A container for an ad unit.
 * Renders a placeholder if no adKey is provided.
 * Otherwise, securely injects the Adsterra ad iframe.
 */
export function AdSlot({
  width,
  height,
  label = "Ad",
  className = "",
  adKey,
  adDomain = "www.highperformanceformat.com", // Default, replace with the one they provide
}: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If no adKey is provided, don't load the script
    if (!adKey || !containerRef.current) return;

    // Clear previous contents to prevent duplicates during React strict-mode re-renders
    containerRef.current.innerHTML = "";

    // 1. Create the configuration script
    const confScript = document.createElement("script");
    confScript.type = "text/javascript";
    confScript.innerHTML = `
      atOptions = {
        'key' : '${adKey}',
        'format' : 'iframe',
        'height' : ${height},
        'width' : ${width},
        'params' : {}
      };
    `;

    // 2. Create the invocation script
    const invokeScript = document.createElement("script");
    invokeScript.type = "text/javascript";
    invokeScript.src = `//${adDomain}/invoke.js`;
    invokeScript.async = true;

    // Append both to our container
    containerRef.current.appendChild(confScript);
    containerRef.current.appendChild(invokeScript);
  }, [adKey, width, height, adDomain]);

  // If we don't have an adKey, show the placeholder
  if (!adKey) {
    return (
      <div
        id={`ad-slot-${width}x${height}`}
        className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] ${className}`}
        style={{ width, height }}
      >
        <span className="select-none text-xs font-medium tracking-wide text-white/20">
          {label} · {width}×{height}
        </span>
      </div>
    );
  }

  // Return the container that the Adsterra script will inject the iframe into
  return (
    <div
      ref={containerRef}
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width, height }}
    />
  );
}
