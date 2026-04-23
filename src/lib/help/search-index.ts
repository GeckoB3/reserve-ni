import Fuse from 'fuse.js';
import { buildSearchDocs } from './navigation';
import type { HelpSearchDoc } from './types';

let fuseInstance: Fuse<HelpSearchDoc> | null = null;

export function getHelpSearchFuse(): Fuse<HelpSearchDoc> {
  if (!fuseInstance) {
    const docs = buildSearchDocs();
    fuseInstance = new Fuse(docs, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'description', weight: 2 },
        { name: 'tagsText', weight: 2 },
        { name: 'content', weight: 1 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }
  return fuseInstance;
}

export function searchHelpArticles(query: string, limit = 8): HelpSearchDoc[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const fuse = getHelpSearchFuse();
  return fuse.search(q, { limit }).map((r) => r.item);
}
