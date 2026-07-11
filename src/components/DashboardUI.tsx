"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type OverlaySize = "sm" | "md" | "lg";

interface OverlayProps {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: OverlaySize;
  title: string;
}

const sizeClasses: Record<OverlaySize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

function useDialogBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable =
      panel?.querySelector<HTMLElement>("[autofocus]") ??
      panel?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
    focusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return panelRef;
}

export function Modal({
  children,
  description,
  footer,
  onClose,
  open,
  size = "md",
  title,
}: OverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogBehavior(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`max-h-[92dvh] w-full overflow-hidden rounded-t-lg border border-stone-200 bg-white shadow-2xl sm:rounded-lg ${sizeClasses[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-stone-950">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-stone-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(92dvh-8rem)] overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  children,
  description,
  footer,
  onClose,
  open,
  size = "md",
  title,
}: OverlayProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useDialogBehavior(open, onClose);
  const width = size === "lg" ? "sm:max-w-3xl" : size === "sm" ? "sm:max-w-md" : "sm:max-w-xl";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-stone-950/40 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`flex h-full w-full flex-col border-l border-stone-200 bg-white shadow-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-stone-950">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-stone-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  busy?: boolean;
  confirmLabel?: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  open: boolean;
  title: string;
  tone?: "danger" | "primary";
}

export function ConfirmDialog({
  busy = false,
  confirmLabel = "Confirm",
  description,
  onCancel,
  onConfirm,
  open,
  title,
  tone = "danger",
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-700 hover:bg-emerald-800"
            }`}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-stone-600">
        This action will be applied immediately.
      </p>
    </Modal>
  );
}

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 top-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full rounded-md border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : toast.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-stone-200 bg-white text-stone-800"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

interface PageHeaderProps {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}

export function PageHeader({ actions, description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase text-emerald-700">{eyebrow}</p>
        )}
        <h1 className="text-xl font-semibold text-stone-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface EmptyStateProps {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
}

export function EmptyState({ actionHref, actionLabel, description, title }: EmptyStateProps) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-lg text-stone-500">
        +
      </div>
      <p className="mt-3 text-sm font-semibold text-stone-900">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-3 px-5 py-6" role="status" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-12 animate-pulse rounded-md bg-stone-100" />
      ))}
      <span className="sr-only">{label}...</span>
    </div>
  );
}

interface ActionMenuProps {
  children: ReactNode;
  label?: string;
  side?: "left" | "right";
}

export function ActionMenu({ children, label = "More actions", side = "right" }: ActionMenuProps) {
  return (
    <details className="relative">
      <summary
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-stone-300 bg-white text-lg text-stone-600 hover:bg-stone-50 hover:text-stone-900"
        aria-label={label}
        title={label}
      >
        ⋯
      </summary>
      <div
        className={`absolute top-11 z-30 min-w-44 rounded-md border border-stone-200 bg-white p-1 shadow-xl ${
          side === "right" ? "right-0" : "left-0"
        }`}
        onClick={(event) => {
          const details = event.currentTarget.closest("details");
          if (details) details.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

export const menuItemClass =
  "flex w-full items-center rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50";
