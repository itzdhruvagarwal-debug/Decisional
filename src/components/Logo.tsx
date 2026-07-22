import Link from "next/link";

export default function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 no-underline"
    >
      <div
        className="p-2 flex items-center justify-center rounded-lg text-white" style={{ background:
            "linear-gradient(135deg, var(--color-primary), var(--color-secondary))", boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)" }}
      >
        {/* Decisional Logo — Signal-to-Decision icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Diamond/decision shape */}
          <path d="M12 2L22 12L12 22L2 12Z" />
          {/* Signal waves inside */}
          <path d="M12 8v4l2 2" strokeWidth="2" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div
        className="flex flex-col" style={{ lineHeight: 1.1 }}
      >
        <span
          className="gradient-text text-2xl font-extrabold tracking-normal"
        >
          Decisional
        </span>
        <span
          className="text-secondary font-semibold uppercase text-2xs tracking-wider"
        >
          From Noise to Decisions
        </span>
      </div>
    </Link>
  );
}
