import { useEffect, useRef, useState } from "react";

/**
 * Empty-state wake screen: a calm ocean-current canvas behind rotating Orca
 * prompts. Reduced-motion users get the final invitation immediately.
 */

const CODE_LINES = [
  "Sonar ping sent\u2026",
  "Found the repo. It was hiding in plain sight.",
  "The pod reviewed your folder names. We have concerns.",
  "Scanning for bugs. They know what they did.",
  "Current stable. Branch name less so.",
  "Orca found the TODO. It was not subtle.",
  "Deep dive in progress. Snacks remain topside.",
  "No seals harmed. One linter mildly offended.",
  "Preparing the pod. Regex was asked to stay ashore.",
  "Give Orca a mission before it refactors for fun.",
] as const;

const CHAT_LINES = [
  "Surfacing for a thought\u2026",
  "Hydrophone on. Whale noises optional.",
  "Go ahead. The pod signed an NDA.",
  "Listening at 40,000 Hz. Still heard that sigh.",
  "Your secrets are safe. The dolphins are nosy, though.",
  "Ask anything. Except why the ocean is wet.",
  "The pod is quiet. This is rarely permanent.",
  "Orca is all ears. Metaphorically complicated.",
  "Say the weird idea. Those are usually useful.",
  "Channel open. Judgment temporarily disabled.",
] as const;

const MOTION_LINES = [
  "Lights\u2026",
  "Drop in a website, a PDF, or an idea.",
  "Tell me what to make. Let\u2019s make it move.",
] as const;

const TYPE_MS = 55;
const HOLD_MS = 6000;
const ERASE_MS = 22;

type Phase = "typing" | "holding" | "erasing";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

function OceanCurrent(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    const canvas = canvasEl;
    const ctx = context;

    let width = 0;
    let height = 0;
    let bubbles: Bubble[] = [];
    let raf = 0;
    let last = 0;

    function seedBubble(fromBottom = false): Bubble {
      const radius = 1.5 + Math.random() * 5;
      return {
        x: Math.random() * width,
        y: fromBottom ? height + radius + Math.random() * 80 : Math.random() * height,
        radius,
        speed: 0.25 + Math.random() * 0.75,
        drift: 4 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.12 + Math.random() * 0.28,
      };
    }

    function resize(): void {
      const parent = canvas.parentElement;
      if (!parent) return;
      const nextWidth = parent.clientWidth;
      const nextHeight = parent.clientHeight;
      if (nextWidth < 2 || nextHeight < 2) return;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bubbles = Array.from({ length: Math.max(18, Math.floor(width / 42)) }, () => seedBubble());
    }

    function drawCurrent(now: number): void {
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let x = -24; x <= width + 24; x += 24) {
          const y =
            height * (0.3 + layer * 0.2) +
            Math.sin(x * 0.012 + now * 0.00025 + layer * 1.7) * (12 + layer * 5);
          if (x === -24) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(64, 205, 220, ${0.045 + layer * 0.018})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      if (now - last < 50) return;
      last = now;
      ctx.clearRect(0, 0, width, height);
      drawCurrent(now);

      for (let index = 0; index < bubbles.length; index++) {
        let bubble = bubbles[index];
        bubble.y -= bubble.speed;
        if (bubble.y < -bubble.radius) {
          bubble = seedBubble(true);
          bubbles[index] = bubble;
        }
        const x = bubble.x + Math.sin(now * 0.0006 + bubble.phase) * bubble.drift;
        ctx.beginPath();
        ctx.arc(x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(140, 235, 242, ${bubble.alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const observer = new ResizeObserver(resize);
    resize();
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    function startLoop(): void {
      if (raf === 0) raf = requestAnimationFrame(frame);
    }
    function stopLoop(): void {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    function onVisible(): void {
      if (document.visibilityState === "visible") {
        resize();
        startLoop();
      } else {
        stopLoop();
      }
    }

    // A window restored at launch never receives a blur event, so an
    // unconditional start would loop forever in the background.
    if (document.hasFocus()) startLoop();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", startLoop);
    window.addEventListener("blur", stopLoop);

    return () => {
      stopLoop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", startLoop);
      window.removeEventListener("blur", stopLoop);
    };
  }, []);

  return <canvas ref={canvasRef} className="wake-rain" aria-hidden="true" />;
}

export function WakeScreen({
  chat = false,
  motion = false,
}: {
  chat?: boolean;
  motion?: boolean;
}): React.ReactElement {
  const reduced = prefersReducedMotion();
  const lines = motion ? MOTION_LINES : chat ? CHAT_LINES : CODE_LINES;
  const [text, setText] = useState(reduced ? lines[lines.length - 1] : "");

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let line = 0;
    let pos = 0;
    let phase: Phase = "typing";

    function tick() {
      if (cancelled) return;
      const full = lines[line];

      if (phase === "typing") {
        pos++;
        setText(full.slice(0, pos));
        if (pos >= full.length) {
          phase = "holding";
          timer = setTimeout(tick, HOLD_MS);
        } else {
          timer = setTimeout(tick, TYPE_MS);
        }
        return;
      }

      if (phase === "holding") {
        phase = "erasing";
        timer = setTimeout(tick, ERASE_MS);
        return;
      }

      // erasing
      pos--;
      setText(full.slice(0, Math.max(0, pos)));
      if (pos <= 0) {
        line = (line + 1) % lines.length;
        phase = "typing";
        timer = setTimeout(tick, TYPE_MS * 4);
      } else {
        timer = setTimeout(tick, ERASE_MS);
      }
    }

    timer = setTimeout(tick, 450); // brief beat before the first keystroke
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lines, reduced]);

  return (
    <div className="wake-screen transcript-reveal" aria-label="Ready to start">
      {!reduced && <OceanCurrent />}
      <div className="wake-text">
        <span className="wake-line">{text}</span>
        <span className="wake-cursor">{"\u2588"}</span>
      </div>
    </div>
  );
}
