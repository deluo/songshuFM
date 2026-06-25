// SHIM — re-exports feed/search.ts for backwards compatibility with existing
// `from '../api-search'` importers. The real implementation now lives in
// src/feed/search.ts. This file is deleted in WF4 Task 4.6 once handlers
// import directly from feed/search. Do not add new exports here.
export {
  search,
  cleanTitle,
  normalize,
  titleMatches,
  simpleHash,
} from '../feed/search';
