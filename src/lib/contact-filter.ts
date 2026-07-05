import nlp from "compromise";

const CONTACT_REGEX = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  emailObfuscated:
    /[a-zA-Z0-9.\-_]+(?:\s+|\s*\[\s*|\s*\()\s*(?:at|@)\s*(?:\s+|\]\s*|\)\s*)?[a-zA-Z0-9.\-_]+\s*(?:dot|\.)\s*[a-zA-Z]{2,}/gi,
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  url: /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\b[a-zA-Z0-9.-]+\.(?:com|net|org|edu|gov|mil|biz|info|io)\b)/gi,
  socialHandle:
    /@(gmail\.com|whatsapp|instagram|telegram|t\.me|linktr\.ee)\b|whatsapp|instagram|telegram|t\.me|linktr\.ee|insta:|ig:|wp:|vpa:|upi:/gi,
  numberWords:
    /(zero|one|two|three|four|five|six|seven|eight|nine)[\s\p{P}]*(zero|one|two|three|four|five|six|seven|eight|nine)/giu,
  upi: /[a-zA-Z0-9.\-_]+@(ybl|okaxis|okicici|paytm|upi|apl|axl|ibl|sib|federal|hsbc|hdfc|icici|barodampay|sbi|waaxis|wasbi|kmbl|oklahoma|okl|postbank)/gi,
};

function normalizeHomoglyphs(str: string): string {
  const homoglyphsMap: Record<string, string> = {
    // lowercase cyrillic/greek
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ѕ": "s", "α": "a",
    // uppercase cyrillic/greek
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "І": "I",
    // other common lookalikes/accents
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "æ": "ae", "ç": "c", "è": "e", "é": "e", "ê": "e", "ë": "e", "ì": "i",
    "í": "i", "î": "i", "ï": "i", "ñ": "n", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "ý": "y", "ÿ": "y",
  };
  return str.split("").map((char) => homoglyphsMap[char] || char).join("");
}

function cleanAndNormalizeText(str: string): string {
  let clean = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F\u007F-\u009F]/g, "");
  clean = normalizeHomoglyphs(clean);
  clean = clean.toLowerCase();
  clean = clean
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[0o]/g, "o")
    .replace(/[1i]/g, "i")
    .replace(/[3e]/g, "e")
    .replace(/[4a]/g, "a")
    .replace(/[5s]/g, "s")
    .replace(/[7t]/g, "t");

  // Keep only alphanumeric characters to strip spaces, emojis, punctuation, etc.
  clean = clean.replace(/[^a-z0-9]/g, "");
  return clean;
}

export function checkMessageForContacts(content: string) {
  const findings: string[] = [];

  // Check Email (including obfuscated like "john at gmail dot com")
  if (
    content.match(CONTACT_REGEX.email) ||
    content.match(CONTACT_REGEX.emailObfuscated) ||
    content.toLowerCase().includes(" at gmail dot") ||
    content.toLowerCase().includes(" at yahoo dot")
  ) {
    findings.push("email");
  }

  // Check Phone — require digits to appear in a phone-like consecutive pattern,
  // not scattered across the entire message (avoids false positives on prices/IDs)
  const phonePatternMatch = content.match(CONTACT_REGEX.phone);
  if (phonePatternMatch) findings.push("phone");

  // Check URLs
  if (content.match(CONTACT_REGEX.url)) findings.push("url");

  // Check Social Handles & Obfuscated platform names (Leetspeak / Spaced Out)
  // Converts "w h a t s a p p" to "whatsapp", "1nstagram" to "instagram", "tele gram" to "telegram"
  const normalizedContent = cleanAndNormalizeText(content);

  if (
    content.match(CONTACT_REGEX.socialHandle) ||
    ["whatsapp", "instagram", "telegram", "linktree", "gmailcom", "insta", "ig", "wp"].some((kw) =>
      normalizedContent.includes(kw),
    )
  ) {
    findings.push("social");
  }

  // Check UPI IDs (VPAs) for pre-contract payment bypass attempts
  if (
    content.match(CONTACT_REGEX.upi) ||
    normalizedContent.includes("upiid") ||
    normalizedContent.includes("vpa") ||
    normalizedContent.includes("paytmme")
  ) {
    findings.push("upi");
  }

  // Check Number Words
  let wordCount = 0;
  const words = content.toLowerCase().split(/[\s,.-]+/);
  const numberWordsSet = new Set([
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ]);
  for (const w of words) {
    if (numberWordsSet.has(w)) wordCount++;
  }
  if (wordCount >= 5 || content.match(CONTACT_REGEX.numberWords))
    findings.push("obfuscated_phone");

  // --- NLP Based Detection with Compromise ---
  const doc = nlp(content);

  // 1. Detect Intent + Contact Keywords
  const hasContactIntent = doc.match(
    "(call|text|message|ping|mail|email|reach|dm|pm|whatsapp|contact|connect|talk|speak) (me|us) (on|at|in|via)?",
  ).found;
  const hasContactPhrase = doc.match(
    "(my|our) (number|phone|whatsapp|telegram|insta|instagram|skype|tg|li|linkedin|mail|email|id) is",
  ).found;
  const hasPhoneKeywords = doc.match(
    "(number|mobile|phone|whatsapp|telegram|insta|instagram|skype|tg|li|linkedin)",
  ).found;

  if (hasContactPhrase || (hasContactIntent && hasPhoneKeywords)) {
    // High likelihood of trying to bypass
    if (!findings.includes("nlp_contact_intent"))
      findings.push("nlp_contact_intent");
  }

  // 2. Extracted Numbers via NLP
  // Check if the user is writing out a phone number using words (e.g. "nine eight seven six...")
  const extractedNumbers = doc.numbers().out("array") as string[];
  let totalDigitsFromWords = 0;

  for (const numStr of extractedNumbers) {
    // Just extract numeric digits from the interpreted number
    const digitsOnly = String(numStr).replace(/\D/g, "");
    totalDigitsFromWords += digitsOnly.length;
  }

  // Check if total numerical digits + digits generated from word forms form a phone number
  if (totalDigitsFromWords >= 10 && wordCount < 5) {
    if (!findings.includes("nlp_obfuscated_phone"))
      findings.push("nlp_obfuscated_phone");
  }

  // Catch hybrid: 9 eight 7 six ...
  // Extract digits found in phone-pattern matches for the hybrid check
  const patternDigits = phonePatternMatch
    ? phonePatternMatch.join("").replace(/\D/g, "").length
    : 0;
  if (patternDigits + totalDigitsFromWords >= 10) {
    if (
      !findings.includes("hybrid_obfuscated_phone") &&
      !findings.includes("phone") &&
      !findings.includes("nlp_obfuscated_phone")
    ) {
      findings.push("hybrid_obfuscated_phone");
    }
  }

  return {
    hasContactInfo: findings.length > 0,
    findings,
  };
}

export function checkAttachmentForContacts(fileUrl: string) {
  if (!fileUrl) return { hasContactInfo: false, findings: [] };

  const findings: string[] = [];
  
  // Extract filename from URL
  let filename = "";
  try {
    const urlObj = new URL(fileUrl);
    const pathname = urlObj.pathname;
    filename = decodeURIComponent(pathname.substring(pathname.lastIndexOf("/") + 1));
  } catch (_e) {
    const lastSlash = fileUrl.lastIndexOf("/");
    filename = decodeURIComponent(lastSlash !== -1 ? fileUrl.substring(lastSlash + 1) : fileUrl);
  }

  // Check the filename content against the regular expressions
  if (filename.match(CONTACT_REGEX.email) || filename.match(CONTACT_REGEX.emailObfuscated)) {
    findings.push("attachment_email");
  }

  if (filename.match(CONTACT_REGEX.phone)) {
    findings.push("attachment_phone");
  }

  if (filename.match(CONTACT_REGEX.upi)) {
    findings.push("attachment_upi");
  }

  const normalizedFilename = cleanAndNormalizeText(filename);

  if (
    filename.match(CONTACT_REGEX.socialHandle) ||
    ["whatsapp", "instagram", "telegram", "linktree", "gmailcom", "insta", "ig", "wp"].some((kw) =>
      normalizedFilename.includes(kw),
    )
  ) {
    findings.push("attachment_social");
  }

  if (
    normalizedFilename.includes("upiid") ||
    normalizedFilename.includes("vpa") ||
    normalizedFilename.includes("paytmme")
  ) {
    findings.push("attachment_upi");
  }

  // Check if filename contains a contiguous block of 8+ digits (very likely a phone number or UPI)
  if (/\d{8,}/.test(filename)) {
    findings.push("attachment_digits");
  }

  return {
    hasContactInfo: findings.length > 0,
    findings,
  };
}
