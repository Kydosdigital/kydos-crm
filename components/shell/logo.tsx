/** The Kydos mark: a lime tile with a K cut from two strokes. Works on light and dark grounds. */
export function KydosMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Kydos">
      <rect width="32" height="32" rx="9" fill="#d4f25a" />
      <path d="M11 8.5v15M21.5 8.5 12 17l10 6.5" fill="none" stroke="#0b1f1a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KydosWordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <KydosMark />
      <span className="text-[15px] font-semibold tracking-tight">Kydos<span className="ml-1.5 font-normal opacity-60">CRM</span></span>
    </span>
  );
}
