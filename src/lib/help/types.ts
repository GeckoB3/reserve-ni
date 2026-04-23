export type HelpPlanFilter = 'restaurant' | 'appointments' | 'all';

export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  content: string;
  tags?: string[];
}

export interface HelpCategory {
  slug: string;
  title: string;
  description: string;
  plan: HelpPlanFilter;
  articles: HelpArticle[];
}

/** Flat record for Fuse search */
export interface HelpSearchDoc {
  id: string;
  href: string;
  categorySlug: string;
  categoryTitle: string;
  articleSlug: string;
  title: string;
  description: string;
  tagsText: string;
  content: string;
}
