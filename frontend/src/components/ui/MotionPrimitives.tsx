import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";

interface BlurTextProps {
  text: string;
  className?: string;
}

export function BlurText({ text, className = "" }: BlurTextProps) {
  const prefersReduced = useReducedMotion();
  const words = text.split(" ");

  if (prefersReduced) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={`inline-flex flex-wrap justify-center gap-x-[0.28em] ${className}`}>
      {words.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 6, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.28,
            delay: Math.min(index * 0.032, 0.22),
            ease: [0.22, 1, 0.36, 1]
          }}
          className="inline-block will-change-transform"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  spotlightColor?: string;
  hoverLift?: boolean;
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(79, 70, 229, 0.055)",
  hoverLift = true,
  ...rest
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = useReducedMotion();

  function handleMouseMove(event: MouseEvent<HTMLDivElement>): void {
    if (prefersReduced || !cardRef.current) {
      return;
    }
    const rect = cardRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    cardRef.current.style.setProperty("--spot-x", `${x}px`);
    cardRef.current.style.setProperty("--spot-y", `${y}px`);
    cardRef.current.style.setProperty("--spot-opacity", "1");
  }

  function handleMouseLeave(): void {
    if (!cardRef.current) {
      return;
    }
    cardRef.current.style.setProperty("--spot-opacity", "0");
  }

  const styleVars = {
    "--spot-color": spotlightColor
  } as React.CSSProperties;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={styleVars}
      className={`ui-spotlight ${hoverLift ? "ui-card-hover" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CountUpInrProps {
  value: number;
  className?: string;
}

export function CountUpInr({ value, className = "" }: CountUpInrProps) {
  const prefersReduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousRef = useRef<number>(value);

  useEffect(() => {
    if (prefersReduced) {
      setDisplayValue(value);
      previousRef.current = value;
      return;
    }

    const startValue = previousRef.current;
    const delta = value - startValue;
    if (delta === 0) {
      return;
    }

    const durationMs = 300;
    const startTime = performance.now();
    let frameId = 0;

    function tick(now: number): void {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(startValue + delta * eased);
      setDisplayValue(nextVal);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
      else {
        previousRef.current = value;
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      previousRef.current = value;
    };
  }, [value, prefersReduced]);

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      ₹{displayValue.toLocaleString("en-IN")}
    </span>
  );
}

interface SparkBurst {
  id: number;
  x: number;
  y: number;
}

interface ClickSparkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  sparkColor?: string;
}

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function ClickSparkButton({
  children,
  sparkColor = "#A5B4FC",
  onClick,
  className = "",
  ...rest
}: ClickSparkButtonProps) {
  const prefersReduced = useReducedMotion();
  const [bursts, setBursts] = useState<SparkBurst[]>([]);
  const nextIdRef = useRef<number>(1);

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (!prefersReduced && !rest.disabled) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX ? event.clientX - rect.left : rect.width / 2;
      const y = event.clientY ? event.clientY - rect.top : rect.height / 2;
      const id = nextIdRef.current++;
      setBursts((prev) => [...prev, { id, x, y }]);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((item) => item.id !== id));
      }, 400);
    }

    if (onClick) {
      onClick(event);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`relative overflow-hidden ${className}`}
      {...rest}
    >
      {children}
      <AnimatePresence>
        {bursts.map((burst) => (
          <span
            key={burst.id}
            style={{ left: burst.x, top: burst.y }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          >
            {SPARK_ANGLES.map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const dx = Math.cos(rad) * 18;
              const dy = Math.sin(rad) * 18;
              return (
                <motion.span
                  key={deg}
                  initial={{ x: 0, y: 0, opacity: 0.95, scale: 1 }}
                  animate={{ x: dx, y: dy, opacity: 0, scale: 0.35 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.34, ease: "easeOut" }}
                  style={{ backgroundColor: sparkColor }}
                  className="absolute h-1.5 w-1.5 rounded-full -translate-x-1/2 -translate-y-1/2"
                />
              );
            })}
          </span>
        ))}
      </AnimatePresence>
    </button>
  );
}

interface NudgeAlertProps {
  children: ReactNode;
  triggerKey?: string;
  className?: string;
}

export function NudgeAlert({ children, triggerKey, className = "" }: NudgeAlertProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={triggerKey}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: [-4, 4, -2, 0] }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
