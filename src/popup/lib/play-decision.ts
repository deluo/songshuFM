import type { Episode } from '../state';
import { playbackState } from '../state';
import { MSG, sendMessage } from '../../lib/messaging';

// Identity check across unstable episode sources: external RSS may omit id,
// favorites key by eid, detail pages by id. Fall back through audioUrl then url,
// mirroring the chain already used in expanded-player.tsx findPlaylistIndex.
export function isSameEpisode(a: Episode | null, b: Episode | null): boolean {
  if (!a || !b) return false;
  const aid = a.id || a.eid;
  const bid = b.id || b.eid;
  if (aid && bid) return aid === bid;
  if (a.audioUrl && b.audioUrl) return a.audioUrl === b.audioUrl;
  if (a.url && b.url) return a.url === b.url;
  return false;
}

export type EpisodeAction =
  | { kind: 'toggle' }     // tap on the currently loaded episode → pause/resume
  | { kind: 'play-new' }   // tap on any other episode → load + play (resume position)
  | { kind: 'none' };      // no clickable target, ignore

// The single source of truth for "what does this row click mean." Pure: no
// side effects, no signals. Callers perform the resulting action.
export function decideEpisodeAction(
  clicked: Episode | null,
  current: Episode | null,
): EpisodeAction {
  if (!clicked) return { kind: 'none' };
  if (!current) return { kind: 'play-new' };
  if (isSameEpisode(clicked, current)) return { kind: 'toggle' };
  return { kind: 'play-new' };
}

// Shape of the context the shared helper needs. Callers supply what they have;
// all fields are optional because different entry points know different amounts.
export interface RowClickContext {
  podcast?: any | null;
  episodeList?: any[];
}

// Shared side-effectful wrapper used by every episode list. Runs the decision
// against the current playbackState and performs the action:
//   - toggle  → MSG.TOGGLE (pause/resume the loaded episode)
//   - play-new→ dispatch play-episode (loads + plays, resumes lastPosition)
//   - none    → no-op
export function handleEpisodeRowClick(episode: Episode | null, ctx: RowClickContext = {}): void {
  const action = decideEpisodeAction(episode, playbackState.value?.episode ?? null);
  if (action.kind === 'none') return;
  if (action.kind === 'toggle') {
    sendMessage(MSG.TOGGLE).catch(() => {});
    return;
  }
  document.dispatchEvent(
    new CustomEvent('play-episode', {
      detail: {
        episode,
        episodeList: ctx.episodeList,
        podcast: ctx.podcast,
        autoPlay: true,
      },
    }),
  );
}
