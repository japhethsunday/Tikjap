import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null>; "aria-expanded": boolean; "aria-haspopup": true }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  /**
   * Preferred side to open on. "top" is what a composer control wants — a menu
   * dropping downward out of a bar pinned to the bottom of the screen is
   * immediately clipped. Either preference flips automatically when the chosen
   * side has no room, so the menu is always inside the viewport.
   */
  placement?: "bottom" | "top";
  className?: string;
}

export function Dropdown({ trigger, children, align = "end", placement = "bottom", className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"bottom" | "top">(placement);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Decide the side from real measurements each time the menu opens, and again
  // on resize/scroll, so a menu near an edge flips rather than being cut off.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = buttonRef.current;
      const menu = menuRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // Fall back to a sensible estimate before the menu has been measured.
      const menuHeight = menu?.offsetHeight || 280;
      const gap = 12;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      if (placement === "top") {
        setSide(spaceAbove >= menuHeight || spaceAbove >= spaceBelow ? "top" : "bottom");
      } else {
        setSide(spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "bottom" : "top");
      }
    };
    reposition();
    // A second pass once the menu has rendered gives us its true height.
    const raf = requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        open,
        toggle: () => setOpen((current) => !current),
        ref: buttonRef,
        "aria-expanded": open,
        "aria-haspopup": true,
      })}
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-[70] min-w-48 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-2xl",
            // Cap the height against the viewport and scroll internally, so a
            // long list can never run off the top or bottom of the screen.
            "max-h-[min(70vh,28rem)] overflow-y-auto",
            side === "top" ? "bottom-full mb-2 tk-slide-up" : "top-full mt-2 tk-slide-down",
            align === "end" ? "right-0" : "left-0",
            className
          )}
        >
          {children({ close })}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface"
      )}
    >
      {icon ? <span className="text-muted" aria-hidden>{icon}</span> : null}
      {children}
    </button>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="tk-fade-in relative w-full max-w-md rounded-2xl border border-line bg-elevated p-6 shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}