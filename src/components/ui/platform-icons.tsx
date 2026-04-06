import { Youtube, Twitter, Headphones, Link } from 'lucide-react';
import type { SVGProps } from 'react';

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.98a8.2 8.2 0 0 0 4.76 1.52V7.05a4.84 4.84 0 0 1-1-.36Z" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
    </svg>
  );
}

const TIKTOK_PATTERN = /tiktok\.com/i;
const FACEBOOK_PATTERN = /facebook\.com|fb\.com/i;
const TWITTER_PATTERN = /twitter\.com|x\.com/i;
const YOUTUBE_PATTERN = /youtube\.com|youtu\.be/i;
const PODCAST_HOST_PATTERN =
  /spotify\.com\/show\/|podcasts\.apple\.com|feeds\.|anchor\.fm|feedburner/i;
const PODCAST_PATH_PATTERN = /\.(xml|rss|atom)(\?|$)|\/feed|\/rss/i;

function isPodcastUrl(url: string): boolean {
  if (PODCAST_HOST_PATTERN.test(url)) return true;
  return PODCAST_PATH_PATTERN.test(url);
}

export type PlatformName = 'youtube' | 'twitter' | 'tiktok' | 'facebook' | 'podcast' | string;

export function getPlatformIconByUrl(url: string, className: string = 'h-4 w-4') {
  if (YOUTUBE_PATTERN.test(url)) return <Youtube className={`${className} text-red-500`} />;
  if (TWITTER_PATTERN.test(url)) return <Twitter className={`${className} text-sky-500`} />;
  if (TIKTOK_PATTERN.test(url))
    return <TikTokIcon className={`${className} text-black dark:text-white`} />;
  if (FACEBOOK_PATTERN.test(url)) return <FacebookIcon className={`${className} text-blue-600`} />;
  if (isPodcastUrl(url)) return <Headphones className={`${className} text-emerald-500`} />;
  return <Link className={`${className} text-muted-foreground`} />;
}

export function getPlatformIconByName(platform: PlatformName, className: string = 'h-4 w-4') {
  switch (platform) {
    case 'youtube':
      return <Youtube className={`${className} text-red-500`} />;
    case 'twitter':
      return <Twitter className={`${className} text-sky-500`} />;
    case 'tiktok':
      return <TikTokIcon className={`${className} text-black dark:text-white`} />;
    case 'facebook':
      return <FacebookIcon className={`${className} text-blue-600`} />;
    case 'podcast':
      return <Headphones className={`${className} text-emerald-500`} />;
    default:
      return <Link className={`${className} text-muted-foreground`} />;
  }
}

export function getPlatformColor(platform: PlatformName): string {
  switch (platform) {
    case 'youtube':
      return 'text-red-500';
    case 'twitter':
      return 'text-sky-500';
    case 'tiktok':
      return 'text-black dark:text-white';
    case 'facebook':
      return 'text-blue-600';
    case 'podcast':
      return 'text-emerald-500';
    default:
      return 'text-muted-foreground';
  }
}

export { TikTokIcon, FacebookIcon };
