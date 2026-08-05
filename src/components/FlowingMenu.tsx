import {
  useRef,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { gsap } from "gsap";

export type FlowingMenuItem = {
  id: string;
  text: string;
  subtitle?: string;
  image?: string;
  onSelect: () => void;
  rightSlot?: ReactNode;
};

type FlowingMenuProps = {
  items: FlowingMenuItem[];
  speed?: number;
};

export default function FlowingMenu({ items, speed = 15 }: FlowingMenuProps) {
  return (
    <nav className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {items.map((item, idx) => (
        <MenuItem key={item.id} {...item} speed={speed} isFirst={idx === 0} />
      ))}
    </nav>
  );
}

type MenuItemProps = FlowingMenuItem & { speed: number; isFirst: boolean };

function MenuItem({ text, subtitle, image, onSelect, rightSlot, speed, isFirst }: MenuItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const [repetitions, setRepetitions] = useState(4);

  const animationDefaults = { duration: 0.6, ease: "expo.out" };

  const findClosestEdge = (
    mouseX: number,
    mouseY: number,
    width: number,
    height: number,
  ): "top" | "bottom" => {
    const topEdgeDist = Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY, 2);
    const bottomEdgeDist = Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY - height, 2);
    return topEdgeDist < bottomEdgeDist ? "top" : "bottom";
  };

  useEffect(() => {
    const calculateRepetitions = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        ".marquee-part",
      ) as HTMLElement | null;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      if (!contentWidth) return;
      const needed = Math.ceil(window.innerWidth / contentWidth) + 2;
      setRepetitions(Math.max(4, needed));
    };
    calculateRepetitions();
    window.addEventListener("resize", calculateRepetitions);
    return () => window.removeEventListener("resize", calculateRepetitions);
  }, [text, image]);

  useEffect(() => {
    const setupMarquee = () => {
      if (!marqueeInnerRef.current) return;
      const marqueeContent = marqueeInnerRef.current.querySelector(
        ".marquee-part",
      ) as HTMLElement | null;
      if (!marqueeContent) return;
      const contentWidth = marqueeContent.offsetWidth;
      if (!contentWidth) return;
      animationRef.current?.kill();
      animationRef.current = gsap.to(marqueeInnerRef.current, {
        x: -contentWidth,
        duration: speed,
        ease: "none",
        repeat: -1,
      });
    };
    const timer = setTimeout(setupMarquee, 50);
    return () => {
      clearTimeout(timer);
      animationRef.current?.kill();
    };
  }, [text, image, repetitions, speed]);

  const handleMouseEnter = (ev: ReactMouseEvent<HTMLButtonElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height,
    );
    gsap
      .timeline({ defaults: animationDefaults })
      .set(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .set(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0)
      .to([marqueeRef.current, marqueeInnerRef.current], { y: "0%" }, 0);
  };

  const handleMouseLeave = (ev: ReactMouseEvent<HTMLButtonElement>) => {
    if (!itemRef.current || !marqueeRef.current || !marqueeInnerRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    const edge = findClosestEdge(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      rect.width,
      rect.height,
    );
    gsap
      .timeline({ defaults: animationDefaults })
      .to(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .to(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0);
  };

  return (
    <div
      className="group relative h-24 overflow-hidden text-center sm:h-28"
      ref={itemRef}
      style={{ borderTop: isFirst ? "none" : "1px solid var(--border)" }}
    >
      {rightSlot && (
        <div className="absolute right-3 top-3 z-20 opacity-0 transition group-hover:opacity-100">
          {rightSlot}
        </div>
      )}
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 px-6 py-8 text-foreground"
      >
        <span className="text-[clamp(1.1rem,3vw,1.8rem)] font-semibold uppercase tracking-tight">
          {text}
        </span>
        {subtitle && (
          <span className="text-xs font-normal normal-case text-muted-foreground">{subtitle}</span>
        )}
      </button>
      <div
        className="pointer-events-none absolute left-0 top-0 h-full w-full translate-y-[101%] overflow-hidden bg-foreground"
        ref={marqueeRef}
      >
        <div className="flex h-full w-fit" ref={marqueeInnerRef}>
          {Array.from({ length: repetitions }).map((_, idx) => (
            <div className="marquee-part flex flex-shrink-0 items-center text-background" key={idx}>
              <span className="whitespace-nowrap px-[1vw] text-[clamp(1.1rem,3vw,1.8rem)] font-semibold uppercase leading-none">
                {text}
              </span>
              {image && (
                <div
                  className="mx-[2vw] my-[1.5em] h-[6vh] w-[160px] rounded-[50px] bg-cover bg-center"
                  style={{ backgroundImage: `url(${image})` }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
