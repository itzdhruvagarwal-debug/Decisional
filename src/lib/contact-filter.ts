import nlp from "compromise";

export const CONTACT_REGEX = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  emailObfuscated:
    /[a-zA-Z0-9.\-_]+(?:\s+|\s*\[\s*|\s*\()\s*(?:at|@)\s*(?:\s+|\]\s*|\)\s*)?[a-zA-Z0-9.\-_]+\s*(?:dot|\.)\s*[a-zA-Z]{2,}/gi,
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  url: /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
  socialHandle:
    /@(gmail\.com|whatsapp|instagram|telegram|t\.me|linktr\.ee)\b|whatsapp|instagram|telegram|t\.me|linktr\.ee/gi,
  numberWords:
    /(zero|one|two|three|four|five|six|seven|eight|nine)[\s\p{P}]*(zero|one|two|three|four|five|six|seven|eight|nine)/giu,
};

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
  const normalizedContent = content
    .toLowerCase()
    .replace(/[\s_.,-]/g, "")
    .replace(/[0o]/g, "o")
    .replace(/[1i]/g, "i")
    .replace(/[3e]/g, "e")
    .replace(/[4a@]/g, "a")
    .replace(/[5s$]/g, "s")
    .replace(/[7t]/g, "t");

  if (
    content.match(CONTACT_REGEX.socialHandle) ||
    ["whatsapp", "instagram", "telegram", "linktree", "gmailcom"].some((kw) =>
      normalizedContent.includes(kw),
    )
  ) {
    findings.push("social");
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
