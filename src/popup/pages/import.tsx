import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { MSG, sendMessage } from '../../lib/messaging';
import { t } from '../../lib/i18n';
import { useMessage } from '../hooks/use-message';
import { BackButton } from '../components/BackButton';
import { dispatchClosePage } from '../lib/dom-events';
import { currentPage } from '../state';

interface OpmlOutline {
  title: string;
  text?: string;
  xmlUrl?: string;
  htmlUrl?: string;
}

interface ImportSummary {
  succeeded: number;
  failed: number;
  failedItems?: { title: string; reason?: string }[];
}

const parsedPodcasts = signal<OpmlOutline[]>([]);
const selectedSet = signal<Set<number>>(new Set());
const phase = signal<'pick' | 'preview' | 'importing' | 'summary'>('pick');
const importSummary = signal<ImportSummary | null>(null);
const parseError = signal('');

function parseOpmlXml(xmlText: string): OpmlOutline[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const outlines: OpmlOutline[] = [];
  const body = doc.querySelector('body');
  if (!body) return [];

  const elements = body.querySelectorAll('outline[xmlUrl]');
  elements.forEach((el) => {
    const title = el.getAttribute('title') || el.getAttribute('text') || '';
    const xmlUrl = el.getAttribute('xmlUrl') || '';
    if (xmlUrl) {
      outlines.push({
        title,
        text: el.getAttribute('text') || '',
        xmlUrl,
        htmlUrl: el.getAttribute('htmlUrl') || '',
      });
    }
  });
  return outlines;
}

function handleFileSelect() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.opml,.xml';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const podcasts = parseOpmlXml(text);
      if (podcasts.length === 0) {
        parseError.value = t('opml.noPodcasts');
        return;
      }
      parseError.value = '';
      parsedPodcasts.value = podcasts;
      const all = new Set(podcasts.map((_, i) => i));
      selectedSet.value = all;
      phase.value = 'preview';
    } catch {
      parseError.value = t('opml.parseError');
    }
  };
  input.click();
}

function toggleSelect(index: number) {
  const next = new Set(selectedSet.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  selectedSet.value = next;
}

function selectAll() {
  selectedSet.value = new Set(parsedPodcasts.value.map((_, i) => i));
}

function deselectAll() {
  selectedSet.value = new Set();
}

async function handleImport() {
  phase.value = 'importing';
  const selected = parsedPodcasts.value.filter((_, i) => selectedSet.value.has(i));

  const result = await sendMessage<ImportSummary>(MSG.IMPORT_OPML, {
    podcasts: selected.map((p) => ({
      title: p.title,
      xmlUrl: p.xmlUrl,
      coverUrl: '',
      author: '',
      isExternal: true,
    })),
  });

  if (result) {
    importSummary.value = result;
  } else {
    importSummary.value = {
      succeeded: selected.length,
      failed: 0,
      failedItems: [],
    };
  }
  phase.value = 'summary';
}

function handleSummaryClose() {
  phase.value = 'pick';
  parsedPodcasts.value = [];
  selectedSet.value = new Set();
  importSummary.value = null;
  dispatchClosePage();
  // Let the Mine page refresh its subscription list after an import.
  document.dispatchEvent(new CustomEvent('refresh-mine'));
}

export function ImportPage() {
  const visible = currentPage.value === 'import';

  useEffect(() => {
    if (!visible && phase.value !== 'pick') {
      phase.value = 'pick';
      parsedPodcasts.value = [];
      selectedSet.value = new Set();
      importSummary.value = null;
      parseError.value = '';
    }
  }, [visible]);

  useMessage(MSG.IMPORT_OPML_PROGRESS, (data) => {
    if (!visible) return;
    if (data.summary) importSummary.value = data.summary;
  });

  return (
    <div class={`secondary-page${visible ? ' visible' : ''}`}>
      <div class="secondary-header">
        <BackButton onBack={dispatchClosePage} />
        <div class="secondary-title">{t('import.title')}</div>
      </div>

      <div class="secondary-content">
      {phase.value === 'pick' && (
        <div class="import-panel">
          <div class="import-panel-action">
            <button class="import-panel-btn" onClick={handleFileSelect}>
              {t('import.pickOpml')}
            </button>
          </div>
          {parseError.value && (
            <div class="empty-state import-error-text">{parseError.value}</div>
          )}
        </div>
      )}

      {phase.value === 'preview' && (
        <>
          <div class="sort-toolbar">
            <button class="sort-chip" onClick={selectAll}>{t('opml.selectAll')}</button>
            <button class="sort-chip" onClick={deselectAll}>{t('opml.deselectAll')}</button>
          </div>
          <div class="import-list">
            {parsedPodcasts.value.map((podcast, index) => {
              const selected = selectedSet.value.has(index);
              const initial = (podcast.title || '?')[0].toUpperCase();
              return (
                <div
                  class={`import-row${selected ? ' selected' : ''}`}
                  onClick={() => toggleSelect(index)}
                >
                  <div class="import-row-avatar">{initial}</div>
                  <div class="import-row-info">
                    <div class="import-row-title">{podcast.title}</div>
                    <div class="import-row-url">{podcast.xmlUrl}</div>
                  </div>
                  <div class="import-row-check">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
          <div class="opml-import-footer">
            <button
              class="opml-import-btn"
              disabled={selectedSet.value.size === 0}
              onClick={handleImport}
            >
              {t('opml.importSelected', { count: selectedSet.value.size })}
            </button>
          </div>
        </>
      )}

      {phase.value === 'importing' && (
        <div class="empty-state">{t('opml.importing')}</div>
      )}

      {phase.value === 'summary' && importSummary.value && (
        <div class="import-summary-list">
          <div class="import-summary-header">
            <div class="import-summary-title">{t('opml.summary.title')}</div>
            <div class="import-summary-stats">
              <span class="import-summary-stat success">
                {t('opml.summary.succeeded', { count: importSummary.value.succeeded })}
              </span>
              {importSummary.value.failed > 0 && (
                <span class="import-summary-stat failed">
                  {t('opml.summary.failed', { count: importSummary.value.failed })}
                </span>
              )}
            </div>
          </div>

          {importSummary.value.failedItems && importSummary.value.failedItems.length > 0 && (
            <div>
              <div class="import-summary-section-title">{t('opml.summary.failedItems')}</div>
              {importSummary.value.failedItems.map((item) => (
                <div class="import-summary-item">
                  <div class="import-summary-item-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <div class="import-summary-item-title">{item.title}</div>
                    {item.reason && <div class="import-summary-item-reason">{item.reason}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button class="opml-import-btn" onClick={handleSummaryClose}>
            {t('opml.summary.close')}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
