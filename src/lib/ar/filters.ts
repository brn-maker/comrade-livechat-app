import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ────────────────────────────────────────────────────────────────────────────
// ARFilter interface — every filter implements this
// ────────────────────────────────────────────────────────────────────────────

export interface ARFilter {
  /** Unique identifier, used as the key in FILTER_REGISTRY */
  id: string;
  /** Human-readable label for the UI */
  label: string;
  /**
   * Render one frame.  Called after the raw video frame has already been drawn
   * to the canvas, so filters only need to draw *on top* of it.
   *
   * @param ctx   Canvas 2D context (same size as video)
   * @param video The raw `<video>` element feeding from getUserMedia
   * @param landmarks  Array of 478 normalised face landmarks (empty array if
   *                   no face detected this frame)
   * @param w     Canvas / video width in px
   * @param h     Canvas / video height in px
   */
  render(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    landmarks: NormalizedLandmark[],
    w: number,
    h: number,
  ): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Built-in filters
// ────────────────────────────────────────────────────────────────────────────

/** Passthrough — just the raw video frame, no overlay */
const noneFilter: ARFilter = {
  id: "none",
  label: "No Filter",
  render() {
    /* video frame already drawn — nothing to add */
  },
};

/**
 * Beauty / soft-glow filter.
 * Draws a blurred, semi-transparent copy of the frame on top of itself to
 * create the classic "beauty-cam" skin-smoothing look.
 */
const beautyFilter: ARFilter = {
  id: "beauty",
  label: "Beauty",
  render(ctx, _video, _landmarks, w, h) {
    ctx.save();
    ctx.filter = "blur(6px)";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ctx.canvas, 0, 0, w, h);
    ctx.restore();
  },
};

/**
 * Neon wireframe — draws the face-tesselation mesh as glowing cyan lines.
 */
const maskFilter: ARFilter = {
  id: "mask",
  label: "Neon Mask",
  render(ctx, _video, landmarks, w, h) {
    if (landmarks.length === 0) return;

    ctx.save();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1;
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.8;

    // Draw the face contour as a connected path
    // MediaPipe face mesh contour indices (simplified outer contour)
    const contourIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
      379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
      234, 127, 162, 21, 54, 103, 67, 109, 10,
    ];

    ctx.beginPath();
    for (let i = 0; i < contourIndices.length; i++) {
      const idx = contourIndices[i];
      if (idx >= landmarks.length) continue;
      const lm = landmarks[idx];
      const x = lm.x * w;
      const y = lm.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw eye outlines
    const leftEye = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
    const rightEye = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];

    for (const eyeIndices of [leftEye, rightEye]) {
      ctx.beginPath();
      for (let i = 0; i < eyeIndices.length; i++) {
        const idx = eyeIndices[i];
        if (idx >= landmarks.length) continue;
        const lm = landmarks[idx];
        const x = lm.x * w;
        const y = lm.y * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw lips
    const outerLips = [
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269,
      267, 0, 37, 39, 40, 185, 61,
    ];

    ctx.strokeStyle = "#ff00aa";
    ctx.shadowColor = "#ff00aa";
    ctx.beginPath();
    for (let i = 0; i < outerLips.length; i++) {
      const idx = outerLips[i];
      if (idx >= landmarks.length) continue;
      const lm = landmarks[idx];
      const x = lm.x * w;
      const y = lm.y * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.restore();
  },
};

/**
 * Cartoon eyes — draws enlarged colourful circles over the eye landmarks.
 */
const eyesFilter: ARFilter = {
  id: "eyes",
  label: "Cartoon Eyes",
  render(ctx, _video, landmarks, w, h) {
    if (landmarks.length === 0) return;

    // Eye center landmarks (left iris center = 468, right iris center = 473)
    // Fallback to eye corners if iris landmarks unavailable
    const leftIdx = landmarks.length > 468 ? 468 : 159;
    const rightIdx = landmarks.length > 473 ? 473 : 386;

    const leftEye = landmarks[leftIdx];
    const rightEye = landmarks[rightIdx];
    if (!leftEye || !rightEye) return;

    // Estimate eye size from landmarks (distance between eye corners)
    const leftOuter = landmarks[33];
    const leftInner = landmarks[133];
    const eyeWidth =
      leftOuter && leftInner
        ? Math.hypot(
            (leftInner.x - leftOuter.x) * w,
            (leftInner.y - leftOuter.y) * h,
          )
        : 30;

    const radius = eyeWidth * 0.9;

    for (const eye of [leftEye, rightEye]) {
      const cx = eye.x * w;
      const cy = eye.y * h;

      // White sclera
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Coloured iris
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        cx, cy, radius * 0.1,
        cx, cy, radius * 0.5,
      );
      gradient.addColorStop(0, "#2196f3");
      gradient.addColorStop(1, "#0d47a1");
      ctx.fillStyle = gradient;
      ctx.fill();

      // Pupil
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();

      // Specular highlight
      ctx.beginPath();
      ctx.arc(cx - radius * 0.15, cy - radius * 0.15, radius * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();

      // Outline
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Registry — add more filters here and they're automatically available
// ────────────────────────────────────────────────────────────────────────────

const builtInFilters: ARFilter[] = [
  noneFilter,
  beautyFilter,
  maskFilter,
  eyesFilter,
];

export const FILTER_REGISTRY = new Map<string, ARFilter>(
  builtInFilters.map((f) => [f.id, f]),
);

/** Convenience: list of all filter metadata for building UIs */
export const FILTER_LIST = builtInFilters.map(({ id, label }) => ({
  id,
  label,
}));
