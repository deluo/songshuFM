import { t } from '../../lib/i18n';

// Back navigation button. Replaces the 7 duplicated inline `<button class="back-btn">`
// + SVG blocks. Preserves the exact SVG (polyline) and CSS class so no CSS change
// is needed; callers pass their existing onClick handler.
export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button class="back-btn" onClick={onBack} aria-label={t('common.back')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}
