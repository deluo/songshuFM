import { COMMENT_BASE_URL } from '../lib/constants';

// Fetches comments for an episode from the xiaoyuzhoufm comment API. The base
// URL lives in constants so a future multi-source comments feature can swap it.
export async function getComments(episodeId: string): Promise<{ comments?: any[]; error?: string }> {
  try {
    const resp = await fetch(`${COMMENT_BASE_URL}/episode/${episodeId}`);
    const data = await resp.json();
    return { comments: data.comments || [] };
  } catch (e: any) {
    return { error: e.message };
  }
}
