/**
 * Helper to render standardized HTML message pages for actions like
 * blog subscription verification, unsubscription, and errors.
 */
export function renderResultHtml(
  title: string,
  heading: string,
  message: string,
  isSuccess: boolean,
): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <style>
      body { background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      .card { background: #111827; border: 1px solid #1f2937; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
      h1 { color: ${isSuccess ? "#10b981" : "#ef4444"}; margin-top: 0; }
      a { color: #6366f1; text-decoration: none; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${heading}</h1>
      <p>${message}</p>
      <p><a href="/">Back to Home</a></p>
    </div>
  </body>
</html>`;
}
