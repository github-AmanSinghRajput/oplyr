interface OplyrLogoMarkProps {
  className?: string;
}

export function OplyrLogoMark({ className }: OplyrLogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M211 91C195 52 158 29 116 34C66 40 30 82 36 132C42 183 84 222 135 219C174 217 206 194 220 160"
        stroke="var(--color-logo-track)"
        strokeLinecap="round"
        strokeWidth="28"
      />
      <path
        d="M211 91C195 52 158 29 116 34C66 40 30 82 36 132C42 183 84 222 135 219C174 217 206 194 220 160"
        stroke="var(--color-logo-loop)"
        strokeLinecap="round"
        strokeWidth="16"
      />
      <path
        d="M56 130H80L93 97L110 164L129 76L145 150L159 114H188"
        stroke="var(--color-logo-signal)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <circle cx="211" cy="91" fill="var(--color-logo-loop)" r="10" />
      <circle cx="220" cy="160" fill="var(--color-logo-loop)" r="7" />
    </svg>
  );
}
