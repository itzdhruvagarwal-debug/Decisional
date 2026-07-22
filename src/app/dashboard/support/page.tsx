"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button, Input, Select, Textarea } from "@/components/ui";

import { createSupportSchema } from "@/lib/validations/campaign";
import { z } from "zod";

export type SupportFormValues = z.infer<typeof createSupportSchema>;

export default function SupportPage() {
  const { data: session } = useSession();
  const [type, setType] = useState<"BUG" | "FEEDBACK">("FEEDBACK");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [badgeAwarded, setBadgeAwarded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingScreenshot(true);
    setErrorMsg("");
    setStatusMsg("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "feedback");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload screenshot.");
      }
      setScreenshotUrl(data.data.url);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Screenshot upload failed.");
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg("");
    setErrorMsg("");
    setBadgeAwarded(null);

    const validation = createSupportSchema.safeParse({
      type,
      title: title.trim(),
      description: description.trim(),
      screenshotUrl: screenshotUrl || undefined,
    });

    if (!validation.success) {
      setErrorMsg(validation.error.issues[0]?.message || "Invalid input details.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, description, screenshotUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }
      setStatusMsg(data.message);
      setTitle("");
      setDescription("");
      setScreenshotUrl("");
      if (data.data?.badgeAwarded) {
        setBadgeAwarded(data.data.badgeAwarded);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell user={session?.user}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "24px 16px" }}>
        <header style={{ marginBottom: "32px", textAlign: "center" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px" }} className="gradient-text">
            Support & Feedback Hub
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "16px" }}>
            Submit bug reports or platform feedback and earn gamification badges!
          </p>
        </header>

        <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: "20px", padding: "32px" }}>
          <div>
            <Select
              id="type"
              label="Submission Type"
              value={type}
              onChange={(e) => setType(e.target.value as "BUG" | "FEEDBACK")}
              fullWidth
            >
              <option value="FEEDBACK">Give Platform Feedback</option>
              <option value="BUG">Report a Bug</option>
            </Select>
          </div>

          <div>
            <Input
              type="text"
              id="title"
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "BUG" ? "e.g., OTP login verification fails on step 2" : "e.g., Feature request for YouTube analytics graphs"}
              required
              fullWidth
            />
          </div>

          <div>
            <Textarea
              id="description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "BUG"
                   ? "Describe the issue, steps to reproduce, and what you expected to happen..."
                  : "Share your ideas, suggestions, or comments about the platform experience..."
              }
              required
              rows={5}
              fullWidth
            />
          </div>

          <div>
            <label htmlFor="screenshot-file-input" style={{ display: "block", fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
              Screenshot (Optional)
            </label>
            {screenshotUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--color-bg-tertiary)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                <Image src={screenshotUrl} alt="Uploaded screenshot" width={48} height={48} unoptimized style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "14px" }}>
                  Screenshot uploaded successfully
                </div>
                <Button
                  type="button"
                  aria-label="Remove uploaded screenshot"
                  onClick={() => setScreenshotUrl("")}
                  variant="ghost"
                  style={{ color: "var(--color-error)", fontWeight: 600 }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  aria-label="Upload screenshot for your report"
                  disabled={uploadingScreenshot}
                  onClick={() => fileInputRef.current?.click()}
                  variant="ghost"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px dashed var(--color-border)",
                    color: "var(--color-text-secondary)",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {uploadingScreenshot ? "Uploading screenshot..." : "📷 Upload Screenshot (Max 5MB)"}
                </Button>
                <Input
                  type="file"
                  id="screenshot-file-input"
                  ref={fileInputRef}
                  onChange={handleScreenshotUpload}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  style={{ display: "none" }}
                />
              </div>
            )}
          </div>

          {errorMsg && (
            <div role="alert" aria-live="assertive" style={{ color: "var(--color-error)", padding: "12px", background: "rgba(225,29,72,0.1)", borderRadius: "var(--radius-sm)", fontSize: "14px" }}>
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div role="status" aria-live="polite" style={{ color: "var(--color-success)", padding: "12px", background: "rgba(16,185,129,0.1)", borderRadius: "var(--radius-sm)", fontSize: "14px" }}>
              {statusMsg}
            </div>
          )}

          {badgeAwarded && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px",
              background: "linear-gradient(135deg, rgba(234,179,8,0.15), rgba(249,115,22,0.15))",
              border: "1px solid rgba(234,179,8,0.3)",
              borderRadius: "var(--radius-md)",
            }}>
              <span style={{ fontSize: "36px" }}>🏆</span>
              <div>
                <h4 style={{ fontWeight: 800, color: "var(--color-warning)" }}>New Badge Earned!</h4>
                <p style={{ fontSize: "14px", color: "var(--color-text-primary)", marginTop: "2px" }}>
                  You earned the <strong>{badgeAwarded === "bug_reporter" ? "Bug Reporter" : "Feedback Giver"}</strong> badge! Check it in your Badges tab.
                </p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || uploadingScreenshot}
            variant="primary"
            style={{ justifyContent: "center", padding: "14px", fontWeight: 700 }}
          >
            {loading ? "Submitting..." : "Submit to Support"}
          </Button>
        </form>
      </div>
    </DashboardShell>
  );
}
