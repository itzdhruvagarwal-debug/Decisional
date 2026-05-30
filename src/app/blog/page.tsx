"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const blogPosts = [
  {
    id: "creator-taxes",
    title: "Creator payouts in India: what brands and influencers should track",
    excerpt:
      "PAN, GST status, ITR acknowledgement, invoices, TDS metadata, and payout records should not be an afterthought.",
    date: "May 30, 2026",
    category: "Compliance",
  },
  {
    id: "fake-engagement",
    title: "How brands can spot fake engagement before accepting an application",
    excerpt:
      "Use follower quality, engagement consistency, content history, verification, and post-performance evidence together.",
    date: "May 30, 2026",
    category: "Trust",
  },
  {
    id: "campaign-briefs",
    title: "The campaign brief checklist that prevents most disputes",
    excerpt:
      "A good brief defines deliverables, usage rights, disclosure language, revision rules, deadlines, and acceptance criteria.",
    date: "May 30, 2026",
    category: "Operations",
  },
];

export default function BlogPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container">
            <h1 className="section-title">
              Practical <span className="gradient-text">Guides</span>
            </h1>
            <p className="section-subtitle">
              Short operational notes for safer brand and creator collaborations.
            </p>

            <div className="grid-3" style={{ marginTop: "48px" }}>
              {blogPosts.map((post) => (
                <article
                  id={post.id}
                  key={post.id}
                  className="card"
                  style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
                >
                  <div style={{ fontSize: "12px", color: "var(--color-primary-light)", fontWeight: 800, marginBottom: "10px", textTransform: "uppercase" }}>
                    {post.category} / {post.date}
                  </div>
                  <h2 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "12px", lineHeight: 1.3 }}>
                    {post.title}
                  </h2>
                  <p style={{ color: "var(--color-text-secondary)", fontSize: "15px", lineHeight: 1.7, flex: 1 }}>
                    {post.excerpt}
                  </p>
                  <a href={`#${post.id}`} style={{ marginTop: "20px", color: "var(--color-primary-light)", fontWeight: 700, textDecoration: "none" }}>
                    Read summary
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
