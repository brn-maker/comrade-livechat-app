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
 *
 * NOTE: All hooks must be declared before any conditional returns
 * to satisfy React's Rules of Hooks.
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
  // Start as placeholder when no key; flip to false once the script is injected.
  const [showPlaceholder, setShowPlaceholder] = useState(!adKey);

  useEffect(() => {
    // Nothing to inject without a key or a mounted container.
    if (!adKey || !containerRef.current) return;

    // Key is present — hide the placeholder and inject the ad.
    setShowPlaceholder(false);

    // Clear previous contents on re-render / key change.
    containerRef.current.innerHTML = "";

    // Fall back to placeholder if the script hasn't populated the container
    // within 5 seconds (e.g. network error or ad blocker).
    const timer = setTimeout(() => {
      if (containerRef.current && containerRef.current.innerHTML === "") {
        setShowPlaceholder(true);
      }
    }, 5000);

    try {
      // 1. Configuration object expected by Adsterra's invoke.js
      const confScript = document.createElement("script");
      confScript.type = "text/javascript";
      confScript.text = `atOptions = { 'key': '${adKey}', 'format': 'iframe', 'height': ${height}, 'width': ${width}, 'params': {} };`;

      // 2. Invocation script that reads atOptions and writes the iframe
      const invokeScript = document.createElement("script");
      invokeScript.type = "text/javascript";
      invokeScript.src = `https://${adDomain}/invoke.js`;
      invokeScript.async = true;

      invokeScript.onload = () => {
        console.log("[AdSlot] ad script loaded", { adKey, adDomain, width, height });
        clearTimeout(timer);
      };
      invokeScript.onerror = (e) => {
        console.error("[AdSlot] ad script failed to load", { adKey, adDomain, width, height, e });
        setShowPlaceholder(true);
        clearTimeout(timer);
      };

      containerRef.current.appendChild(confScript);
      containerRef.current.appendChild(invokeScript);
    } catch (err) {
      console.error("[AdSlot] injection error:", err);
      setShowPlaceholder(true);
      clearTimeout(timer);
    }

    return () => clearTimeout(timer);
  }, [adKey, width, height, adDomain]);

  // ── Placeholder ──────────────────────────────────────────────────────────
  if (showPlaceholder || !adKey) {
    return (
      <div
        id={`ad-slot-${width}x${height}-placeholder`}
        className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] ${className}`}
        style={{ width, height }}
      >
        <span className="select-none text-xs font-medium tracking-wide text-white/20">
          {label} · {width}×{height}
        </span>
      </div>
    );
  }

  // ── Ad container ─────────────────────────────────────────────────────────
  return (
    <div
      id={`ad-slot-${width}x${height}`}
      ref={containerRef}
      className={`flex shrink-0 items-center justify-center overflow-hidden ${className}`}
      style={{ width, height }}
    />
  );
}