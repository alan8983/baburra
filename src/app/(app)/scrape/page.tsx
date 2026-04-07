import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

/**
 * The dedicated scrape page has been merged into the unified /input page.
 * This route now redirects to keep bookmarks and external links working.
 */
export default function ScrapePage() {
  redirect(ROUTES.INPUT);
}
