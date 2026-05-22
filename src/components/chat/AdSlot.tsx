"use client";

import { useEffect, useRef, useState } from "react";

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
  adDomain = "www.highperformanceformat.com",
}: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  // Show placeholder if no adKey
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

  useEffect(() => {
    if (!adKey || !containerRef.current) return;

    // Clear previous contents
    containerRef.current.innerHTML = "";

    // Timeout to show placeholder if ad fails to load
    const timer = setTimeout(() => {
      if (containerRef.current && containerRef.current.innerHTML === "") {
        setShowPlaceholder(true);
      }
    }, 5000);

    try {
      // 1. Create the configuration script
      const confScript = document.createElement("script");
      confScript.type = "text/javascript";
      confScript.text = `atOptions = { 'key': '${adKey}', 'format': 'iframe', 'height': ${height}, 'width': ${width}, 'params': {} };`;

      // 2. Create the invocation script
      const invokeScript = document.createElement("script");
      invokeScript.type = "text/javascript";
      invokeScript.src = `https://${adDomain}/invoke.js`;
      invokeScript.async = true;

      invokeScript.onload = () => {
        console.log("[AdSlot] ad script loaded", { adKey, adDomain, width, height });
      };
      invokeScript.onerror = (e) => {
        console.error("[AdSlot] ad script failed to load", { adKey, adDomain, width, height, e });
        setShowPlaceholder(true);
      };

      // Append scripts
      containerRef.current.appendChild(confScript);
      containerRef.current.appendChild(invokeScript);
    } catch (err) {
      console.error("[AdSlot] injection error:", err);
      setShowPlaceholder(true);
    }

    return () => clearTimeout(timer);
  }, [adKey, width, height, adDomain]);

  if (showPlaceholder) {
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

  return (
    <div
      ref={containerRef}
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width, height }}
    />
  );
}