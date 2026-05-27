"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ContactPage() {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "1000px" }}>
            <div style={{ textAlign: "center", marginBottom: "60px" }}>
              <h1 className="section-title">
                Get in <span className="gradient-text">Touch</span>
              </h1>
              <p className="section-subtitle">
                Have questions? We'd love to hear from you.
              </p>
            </div>

            <div className="grid-2" style={{ gap: "48px" }}>
              {/* Contact Info */}
              <div>
                <div className="card" style={{ marginBottom: "24px" }}>
                  <h3
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      marginBottom: "16px",
                    }}
                  >
                    📍 Office
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    123, Startup Hub, Koramangala
                    <br />
                    Bangalore, Karnataka 560034
                    <br />
                    India
                  </p>
                </div>
                <div className="card" style={{ marginBottom: "24px" }}>
                  <h3
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      marginBottom: "16px",
                    }}
                  >
                    📧 Email
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    Support: support@decisional.in
                    <br />
                    Business: partnerships@decisional.in
                  </p>
                </div>
                <div className="card">
                  <h3
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      marginBottom: "16px",
                    }}
                  >
                    📞 Phone
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    +91 98765 43210
                    <br />
                    (Mon-Fri, 10 AM - 7 PM)
                  </p>
                </div>
              </div>

              {/* Form */}
              <div className="card">
                <h3
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    marginBottom: "24px",
                  }}
                >
                  Send a Message
                </h3>
                <form className="space-y-4">
                  <div>
                    <label className="label">Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Your Name"
                    />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      className="input"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="label">Message</label>
                    <textarea
                      className="input"
                      rows={5}
                      placeholder="How can we help?"
                      style={{ resize: "vertical" }}
                    ></textarea>
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%" }}>
                    Send Message
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
