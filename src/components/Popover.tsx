"use client";

import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { cn } from "@/lib/utils";

const TRANSITION = {
  type: "spring" as const,
  bounce: 0.05,
  duration: 0.3,
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, handler]);
}

interface PopoverContextType {
  isOpen: boolean;
  openPopover: () => void;
  closePopover: () => void;
  uniqueId: string;
  note: string;
  setNote: (note: string) => void;
}

const PopoverContext = createContext<PopoverContextType | undefined>(undefined);

function usePopover() {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error("usePopover must be used within a PopoverRoot");
  }
  return context;
}

function usePopoverLogic() {
  const uniqueId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const openPopover = () => setIsOpen(true);
  const closePopover = () => {
    setIsOpen(false);
    setNote("");
  };
  return { isOpen, openPopover, closePopover, uniqueId, note, setNote };
}

interface PopoverRootProps {
  children: React.ReactNode;
  className?: string;
}

export function PopoverRoot({ children, className }: PopoverRootProps) {
  const popoverLogic = usePopoverLogic();
  return (
    <PopoverContext.Provider value={popoverLogic}>
      <MotionConfig transition={TRANSITION}>
        <div className={cn("relative isolate flex items-center justify-center", className)}>
          {children}
        </div>
      </MotionConfig>
    </PopoverContext.Provider>
  );
}

interface PopoverTriggerProps {
  children: React.ReactNode;
  className?: string;
}

export function PopoverTrigger({ children, className }: PopoverTriggerProps) {
  const { openPopover, uniqueId } = usePopover();
  return (
    <motion.button
      key="button"
      type="button"
      layoutId={`popover-${uniqueId}`}
      className={cn(
        "flex h-9 items-center border border-border bg-background px-3 text-foreground",
        className,
      )}
      style={{ borderRadius: 8 }}
      onClick={openPopover}
    >
      <motion.span layoutId={`popover-label-${uniqueId}`} className="text-sm">
        {children}
      </motion.span>
    </motion.button>
  );
}

interface PopoverContentProps {
  children: React.ReactNode;
  className?: string;
}

export function PopoverContent({ children, className }: PopoverContentProps) {
  const { isOpen, closePopover, uniqueId } = usePopover();
  const formContainerRef = useRef<HTMLDivElement>(null);
  useClickOutside(formContainerRef, closePopover);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePopover]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={formContainerRef}
          layoutId={`popover-${uniqueId}`}
          className={cn(
            "absolute z-50 h-[200px] w-[364px] overflow-hidden border border-border bg-background text-foreground shadow-lg outline-none",
            className,
          )}
          style={{
            borderRadius: 12,
            top: "auto",
            left: "auto",
            transform: "none",
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PopoverFormProps {
  children: React.ReactNode;
  onSubmit?: (note: string) => void;
  className?: string;
}

export function PopoverForm({ children, onSubmit, className }: PopoverFormProps) {
  const { note, closePopover } = usePopover();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(note);
    closePopover();
  };
  return (
    <form className={cn("flex h-full flex-col", className)} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}

interface PopoverLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function PopoverLabel({ children, className }: PopoverLabelProps) {
  const { uniqueId, note } = usePopover();
  return (
    <motion.span
      layoutId={`popover-label-${uniqueId}`}
      aria-hidden="true"
      style={{ opacity: note ? 0 : 1 }}
      className={cn("absolute left-4 top-3 select-none text-sm text-muted-foreground", className)}
    >
      {children}
    </motion.span>
  );
}

interface PopoverTextareaProps {
  className?: string;
}

export function PopoverTextarea({ className }: PopoverTextareaProps) {
  const { note, setNote } = usePopover();
  return (
    <textarea
      className={cn(
        "h-full w-full resize-none rounded-md bg-transparent px-4 py-3 text-sm outline-none",
        className,
      )}
      autoFocus
      value={note}
      onChange={(e) => setNote(e.target.value)}
    />
  );
}

interface PopoverFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function PopoverFooter({ children, className }: PopoverFooterProps) {
  return (
    <div key="close" className={cn("flex justify-between px-4 py-3", className)}>
      {children}
    </div>
  );
}

interface PopoverCloseButtonProps {
  className?: string;
}

export function PopoverCloseButton({ className }: PopoverCloseButtonProps) {
  const { closePopover } = usePopover();
  return (
    <button
      type="button"
      className={cn("flex items-center", className)}
      onClick={closePopover}
      aria-label="Fechar"
    >
      <X size={16} className="text-foreground" />
    </button>
  );
}

interface PopoverSubmitButtonProps {
  className?: string;
}

export function PopoverSubmitButton({ className }: PopoverSubmitButtonProps) {
  return (
    <button
      className={cn(
        "relative ml-1 flex h-8 shrink-0 scale-100 select-none appearance-none items-center justify-center rounded-lg border border-border bg-transparent px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 active:scale-[0.98]",
        className,
      )}
      type="submit"
      aria-label="Enviar"
    >
      Enviar
    </button>
  );
}

export function PopoverHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-2 font-semibold text-foreground", className)}>{children}</div>;
}

export function PopoverBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

export function PopoverButton({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-muted",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
