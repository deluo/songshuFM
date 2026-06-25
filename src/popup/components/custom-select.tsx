import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

// The dropdown is portaled to <body> and positioned with position:fixed.
// Why: the select lives inside .settings-card, which has overflow:hidden and
// establishes a clipping/stacking context. An in-place absolute dropdown gets
// clipped by the card and can't rise above sibling cards. Moving it to <body>
// escapes all ancestor overflow/stacking contexts, so it always renders on top
// and never gets cut off.
export function CustomSelect({ options, value, onChange }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Dropdown coords in viewport space (CSS pixels), computed from the trigger.
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const current = options.find(o => o.value === value);
  const currentLabel = current?.label || value;

  function updateCoords() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Right-align the dropdown's right edge with the trigger's right edge.
    // Done by computing left = rect.right - width directly (NOT via
    // translateX), because the dropIn animation sets its own `transform` and
    // would clobber a translateX-based alignment — causing the panel to flash
    // to the right before snapping left.
    setCoords({ top: rect.bottom + 4, left: rect.right - rect.width, width: rect.width });
  }

  // Recompute position when opening, and keep it attached while open.
  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();

    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleScroll() {
      // Re-anchor on any scroll (the list/cards scroll independently) and on
      // resize; close if the trigger is gone.
      if (!triggerRef.current) {
        setOpen(false);
        return;
      }
      updateCoords();
    }

    document.addEventListener('click', handleClickOutside, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  // Dropdown is right-aligned with the trigger: left = rect.right - width,
  // so the panel's right edge meets the trigger's right edge. No transform
  // here — that's owned by the dropIn animation.
  const dropdownStyle = coords
    ? { top: `${coords.top}px`, left: `${coords.left}px`, width: `${coords.width}px` }
    : undefined;

  return (
    <div class="custom-select">
      <button
        ref={triggerRef}
        class="select-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        type="button"
      >
        <span class="select-value">{currentLabel}</span>
        <svg class="select-arrow" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && createPortal(
        <div ref={dropdownRef} class="select-dropdown" style={dropdownStyle}>
          {options.map(opt => (
            <div
              key={opt.value}
              class={`select-option${opt.value === value ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
