"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const blogPosts = [
  {
    id: 1,
    title: "Top 10 Influencer Marketing Trends in India for 2026",
    excerpt:
      "From micro-influencers to AI-generated content, here is what to expect this year.",
    date: "Feb 10, 2026",
    category: "Trends",
    image: "📈",
  },
  {
    id: 2,
    title: "How to Detect Fake Followers: A Brand Guide",
    excerpt:
      "Don't waste your budget. Learn the signs of inauthentic engagement.",
    date: "Feb 05, 2026",
    category: "Guide",
    image: "🔍",
  },
  {
    id: 3,
    title: "Maximizing ROI with Micro-Influencers",
    excerpt:
      "Why smaller creators often drive better engagement than celebrities.",
    date: "Jan 28, 2026",
    category: "Strategy",
    image: "💡",
  },
];

export default function BlogPage() {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container">
            <h1 className="section-title">
              Latest <span className="gradient-text">Insights</span>
            </h1>
            <p className="section-subtitle">
              Tips, trends, and strategies for creators and brands.
            </p>

            <div className="grid-3" style={{ marginTop: "48px" }}>
              {blogPosts.map((post) => (
                <div
                  key={post.id}
                  className="card"
                  style={{
                    padding: "0",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      height: "200px",
                      background: "var(--color-bg-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "64px",
                    }}
                  >
                    {post.image}
                  </div>
                  <div
                    style={{
                      padding: "24px",
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-primary-light)",
                        fontWeight: 600,
                        marginBottom: "8px",
                      }}
                    >
                      {post.category} • {post.date}
                    </div>
                    <h3
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        marginBottom: "12px",
                      }}
                    >
                      {post.title}
                    </h3>
                    <p
                      style={{
                        color: "var(--color-text-secondary)",
                        fontSize: "14px",
                        marginBottom: "24px",
                        flex: 1,
                      }}
                    >
                      {post.excerpt}
                    </p>
                    <Link
                      href={`/blog/${post.id}`}
                      style={{
                        color: "var(--color-primary-light)",
                        fontWeight: 600,
                        fontSize: "14px",
                      }}
                    >
                      Read More →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
