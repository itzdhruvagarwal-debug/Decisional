import nlp from "compromise";

const CONTACT_REGEX = {
  email: /\b[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}\b/gi,
  emailObfuscated:
    /\b[a-z0-9._-]+(?:\s*(?:@|at|\(at\))\s*)[a-z0-9._-]+\s*(?:\.|\bdot\b)\s*[a-z]{2,}\b/gi,
  phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  url: /(?:https?:\/\/\S+)|(?:www\.\S+)|(?:\b[a-z0-9.-]+\.(?:com|net|org|edu|gov|mil|biz|info|io)\b)/gi,
  socialHandle:
    /@(?:gmail\.com|whatsapp|instagram|telegram|t\.me|linktr\.ee)\b|whatsapp|instagram|telegram|t\.me|linktr\.ee|insta:|ig:|wp:|vpa:|upi:/gi,
  numberWords:
    /(?:zero|one|two|three|four|five|six|seven|eight|nine)[\s\p{P}]*(?:zero|one|two|three|four|five|six|seven|eight|nine)/giu,
  upi: /\b[a-z0-9._-]+@(?!google\b)(?:paytm|federal|icici|barodampay|postbank|ok[a-z]+|wa[a-z]+|[a-z]{3,4})\b/gi,
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
    .replaceAll("@", "a")
    .replaceAll("$", "s")
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

function testRegex(regex: RegExp, text: string): boolean {
  regex.lastIndex = 0;
  return regex.exec(text) !== null;
}

function checkBasicContacts(content: string, findings: string[]) {
  if (
    testRegex(CONTACT_REGEX.email, content) ||
    testRegex(CONTACT_REGEX.emailObfuscated, content) ||
    content.toLowerCase().includes(" at gmail dot") ||
    content.toLowerCase().includes(" at yahoo dot")
  ) {
    findings.push("email");
  }

  if (testRegex(CONTACT_REGEX.phone, content)) {
    findings.push("phone");
  }

  if (testRegex(CONTACT_REGEX.url, content)) {
    findings.push("url");
  }
}

function checkSocialAndUpi(content: string, normalizedContent: string, findings: string[]) {
  if (
    testRegex(CONTACT_REGEX.socialHandle, content) ||
    ["whatsapp", "instagram", "telegram", "linktree", "gmailcom", "insta", "ig", "wp"].some((kw) =>
      normalizedContent.includes(kw),
    )
  ) {
    findings.push("social");
  }

  if (
    testRegex(CONTACT_REGEX.upi, content) ||
    normalizedContent.includes("upiid") ||
    normalizedContent.includes("vpa") ||
    normalizedContent.includes("paytmme")
  ) {
    findings.push("upi");
  }
}

function checkNumberWords(content: string, findings: string[]): number {
  let wordCount = 0;
  const words = content.toLowerCase().split(/[\s,.-]+/);
  const numberWordsSet = new Set([
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"
  ]);
  for (const w of words) {
    if (numberWordsSet.has(w)) wordCount++;
  }
  if (wordCount >= 5 || testRegex(CONTACT_REGEX.numberWords, content)) {
    findings.push("obfuscated_phone");
  }
  return wordCount;
}

function checkNlpContact(content: string, findings: string[], wordCount: number, phonePatternMatch: RegExpMatchArray | null) {
  const doc = nlp(content);

  const hasContactPhrase = doc.match(
    "(my|our) (number|phone|whatsapp|telegram|insta|instagram|skype|tg|li|linkedin|mail|email|id) is",
  ).found;
  const hasContactIntent = doc.match(
    "(call|text|message|ping|mail|email|reach|dm|pm|whatsapp|contact|connect|talk|speak) (me|us) (on|at|in|via)?",
  ).found;
  const hasPhoneKeywords = doc.match(
    "(number|mobile|phone|whatsapp|telegram|insta|instagram|skype|tg|li|linkedin)",
  ).found;

  if (hasContactPhrase || (hasContactIntent && hasPhoneKeywords)) {
    if (!findings.includes("nlp_contact_intent")) {
      findings.push("nlp_contact_intent");
    }
  }

  const extractedNumbers = doc.numbers().out("array") as string[];
  let totalDigitsFromWords = 0;

  for (const numStr of extractedNumbers) {
    const digitsOnly = String(numStr).replace(/\D/g, "");
    totalDigitsFromWords += digitsOnly.length;
  }

  if (totalDigitsFromWords >= 10 && wordCount < 5) {
    if (!findings.includes("nlp_obfuscated_phone")) {
      findings.push("nlp_obfuscated_phone");
    }
  }

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
}

export function checkMessageForContacts(content: string) {
  const findings: string[] = [];
  const normalizedContent = cleanAndNormalizeText(content);
  const phonePatternMatch = CONTACT_REGEX.phone.exec(content);

  checkBasicContacts(content, findings);
  checkSocialAndUpi(content, normalizedContent, findings);
  const wordCount = checkNumberWords(content, findings);
  checkNlpContact(content, findings, wordCount, phonePatternMatch);

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
  } catch {
    // Fallback to raw extraction if URL parsing fails
    const lastSlash = fileUrl.lastIndexOf("/");
    filename = decodeURIComponent(lastSlash !== -1 ? fileUrl.substring(lastSlash + 1) : fileUrl);
  }

  if (testRegex(CONTACT_REGEX.email, filename) || testRegex(CONTACT_REGEX.emailObfuscated, filename)) {
    findings.push("attachment_email");
  }

  if (testRegex(CONTACT_REGEX.phone, filename)) {
    findings.push("attachment_phone");
  }

  if (testRegex(CONTACT_REGEX.upi, filename)) {
    findings.push("attachment_upi");
  }

  const normalizedFilename = cleanAndNormalizeText(filename);

  if (
    testRegex(CONTACT_REGEX.socialHandle, filename) ||
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
