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
      <div className="max-w-680 mx-auto" style={{ padding: "24px 16px" }}>
        <header className="mb-8 text-center">
          <h1 className="font-extrabold mb-2 gradient-text text-3xl">
            Support & Feedback Hub
          </h1>
          <p className="text-secondary text-base">
            Submit bug reports or platform feedback and earn gamification badges!
          </p>
        </header>

        <form onSubmit={handleSubmit} className="card grid gap-5 p-8">
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
            <label htmlFor="screenshot-file-input" className="block font-semibold mb-2 text-sm">
              Screenshot (Optional)
            </label>
            {screenshotUrl ? (
              <div className="flex items-center gap-3 p-3 bg-tertiary rounded-md border-card">
                <Image src={screenshotUrl} alt="Uploaded screenshot" width={48} height={48} unoptimized className="object-cover rounded-sm" />
                <div className="flex-1 overflow-hidden text-sm whitespace-nowrap" style={{ textOverflow: "ellipsis" }}>
                  Screenshot uploaded successfully
                </div>
                <Button
                  type="button"
                  aria-label="Remove uploaded screenshot"
                  onClick={() => setScreenshotUrl("")}
                  variant="ghost"
                  className="font-semibold text-rose"
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
                  className="w-full p-3 text-secondary text-center font-semibold" style={{ border: "1px dashed var(--color-border)" }}
                >
                  {uploadingScreenshot ? "Uploading screenshot..." : "📷 Upload Screenshot (Max 5MB)"}
                </Button>
                <Input
                  type="file"
                  id="screenshot-file-input"
                  ref={fileInputRef}
                  onChange={handleScreenshotUpload}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />
              </div>
            )}
          </div>

          {errorMsg && (
            <div role="alert" aria-live="assertive" className="p-3 text-sm rounded-sm text-rose" style={{ background: "rgba(225,29,72,0.1)" }}>
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div role="status" aria-live="polite" className="p-3 text-sm rounded-sm text-emerald bg-emerald-subtle">
              {statusMsg}
            </div>
          )}

          {badgeAwarded && (
            <div className="flex items-center gap-4 p-4 rounded-md" style={{ background: "linear-gradient(135deg, rgba(234,179,8,0.15), rgba(249,115,22,0.15))", border: "1px solid rgba(234,179,8,0.3)" }}>
              <span className="text-3xl">🏆</span>
              <div>
                <h4 className="font-extrabold text-amber">New Badge Earned!</h4>
                <p className="text-sm text-primary mt-1">
                  You earned the <strong>{badgeAwarded === "bug_reporter" ? "Bug Reporter" : "Feedback Giver"}</strong> badge! Check it in your Badges tab.
                </p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || uploadingScreenshot}
            variant="primary"
            className="justify-center font-bold p-3.5"
          >
            {loading ? "Submitting..." : "Submit to Support"}
          </Button>
        </form>
      </div>
    </DashboardShell>
  );
}
