import { useState, useRef } from 'preact/hooks';
import { t } from '../../lib/i18n';

// Two-click confirm button. First click enters a "confirming" state showing the
// confirm label; a second click within the timeout fires onConfirm. If no second
// click comes, it reverts to the default (children) state. Replaces the imperative
// dataset.confirming + innerHTML approach in favorites.tsx with state-driven
// rendering that plays correctly with Preact's virtual DOM.
export function ConfirmButton({
  onConfirm, children, confirmLabel, title, ariaLabel, class: cls,
}: {
  onConfirm: (e: Event) => void;
  children: any;
  confirmLabel?: string;
  title?: string;
  ariaLabel?: string;
  class?: string;
}) {
  const [stage, setStage] = useState<'idle' | 'confirming'>('idle');
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    if (revertTimer.current) { clearTimeout(revertTimer.current); revertTimer.current = null; }
    setStage('idle');
  };

  const click = (e: Event) => {
    e.stopPropagation();
    if (stage === 'idle') {
      setStage('confirming');
      revertTimer.current = setTimeout(reset, 3000);
    } else {
      reset();
      onConfirm(e);
    }
  };

  const className = `confirm-btn ${cls || ''} ${stage === 'confirming' ? 'confirming' : ''}`.trim();
  const label = confirmLabel || t('common.confirm');

  return (
    <button
      class={className}
      title={stage === 'confirming' ? label : (title || ariaLabel)}
      aria-label={stage === 'confirming' ? label : (ariaLabel || title)}
      onClick={click}
    >
      {stage === 'confirming' ? <span class="confirm-label">{label}</span> : children}
    </button>
  );
}
