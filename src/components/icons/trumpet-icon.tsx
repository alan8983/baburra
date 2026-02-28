export function TrumpetIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Rubber squeeze bulb (bottom-left) */}
      <circle cx="7.5" cy="17.5" r="3.5" />
      {/* Horn bell pointing upper-right, 45° tip angle, touching bulb */}
      <path d="M10 15L20 11L14 5Z" />
      {/* Sound wave arcing outward from opening */}
      <path d="M20 11Q21 7 14 5" />
    </svg>
  );
}
