import React, { useEffect, useId, useRef } from "react";

/**
 * Accessible modal dialog with focus trap-ish behavior (initial focus) and ESC close.
 * For a lightweight template, we keep implementation simple while meeting keyboard needs.
 */
// PUBLIC_INTERFACE
export default function Modal({
  isOpen,
  title,
  description,
  children,
  onClose,
  footer,
  labelledById,
  describedById,
  initialFocusSelector,
}) {
  /** Renders an accessible modal dialog with overlay. */
  const fallbackTitleId = useId();
  const fallbackDescId = useId();
  const dialogRef = useRef(null);
  const lastActiveElementRef = useRef(null);

  const titleId = labelledById || fallbackTitleId;
  const descId = describedById || fallbackDescId;

  useEffect(() => {
    if (!isOpen) return;

    lastActiveElementRef.current = document.activeElement;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);

    // Set initial focus inside the dialog
    setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const target = initialFocusSelector
        ? root.querySelector(initialFocusSelector)
        : root.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
      if (target && typeof target.focus === "function") target.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const last = lastActiveElementRef.current;
      if (last && typeof last.focus === "function") last.focus();
    };
  }, [isOpen, onClose, initialFocusSelector]);

  if (!isOpen) return null;

  return (
    <div className="modalOverlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitleWrap">
            <h2 id={titleId} className="modalTitle">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="modalDescription">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="iconButton"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="modalBody">{children}</div>

        {footer ? <div className="modalFooter">{footer}</div> : null}
      </div>
    </div>
  );
}
