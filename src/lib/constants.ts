export const APP_NAME = "Tikjap AI";
export const APP_TAGLINE = "Your AI copilot for work, code, and ideas";

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export const ALLOWED_FILE_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".docx",
  ".csv",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
] as const;

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

export const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json"];

export function fileKindFromExtension(ext: string): "text" | "image" | "pdf" | "spreadsheet" | "archive" | "other" {
  const lower = ext.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(lower)) return "image";
  if (lower === ".pdf") return "pdf";
  if (lower === ".csv") return "spreadsheet";
  if (TEXT_EXTENSIONS.includes(lower)) return "text";
  return "other";
}

export function getFileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0) return "";
  return name.slice(index).toLowerCase();
}

export function isAllowedFile(name: string): boolean {
  return (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(getFileExtension(name));
}

export function isImageFile(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(getFileExtension(name));
}

export const THEME_STORAGE_KEY = "tk-theme";

export const DEMO_PLANS = [
  {
    name: "Free",
    price: 0,
    features: ["100 messages / day", "All core models", "File attachments", "Community support"],
  },
  {
    name: "Pro",
    price: 20,
    features: ["Unlimited messages", "Priority models & context", "Longer attachments", "Priority support"],
  },
  {
    name: "Team",
    price: 49,
    features: ["Everything in Pro", "Shared workspaces", "Admin dashboard", "SSO & audit logs"],
  },
];