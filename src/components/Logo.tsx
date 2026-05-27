import Link from "next/link";

export default function Logo() {
  return (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
          borderRadius: "12px",
          padding: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
        }}
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
        style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}
      >
        <span
          className="gradient-text"
          style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.5px" }}
        >
          Decisional
        </span>
        <span
          style={{
            fontSize: "10px",
            color: "var(--color-text-secondary)",
            fontWeight: 600,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
          }}
        >
          From Noise to Decisions
        </span>
      </div>
    </Link>
  );
}
