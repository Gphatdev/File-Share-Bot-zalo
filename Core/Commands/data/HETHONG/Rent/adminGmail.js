import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RENT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ADMIN_GMAIL_PATH = path.resolve(
  RENT_DIR,
  "..",
  "..",
  "..",
  "..",
  "..",
  "Data",
  "admin_gmail.json",
);

const locks = new Map();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : "";
}

async function withFileLock(filePath, action) {
  const previous = locks.get(filePath) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(filePath, current);
  await previous;
  try {
    return await action();
  } finally {
    if (locks.get(filePath) === current) locks.delete(filePath);
    release();
  }
}

async function readEmails(filePath) {
  let contents;
  try {
    contents = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  let data;
  try {
    data = JSON.parse(contents);
  } catch (err) {
    throw new Error(`Tệp ${path.basename(filePath)} không phải JSON hợp lệ: ${err.message}`);
  }

  const emails = Array.isArray(data) ? data : data?.emails;
  if (!Array.isArray(emails)) {
    throw new Error(`Tệp ${path.basename(filePath)} phải có danh sách "emails".`);
  }
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}

async function writeEmails(filePath, emails) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(
      tempPath,
      `${JSON.stringify({ emails }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await fs.rename(tempPath, filePath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function getAdminGmails({
  filePath = ADMIN_GMAIL_PATH,
  legacyEmail = "",
} = {}) {
  return withFileLock(filePath, async () => {
    const emails = await readEmails(filePath);
    const legacy = normalizeEmail(legacyEmail);
    if (legacy && !emails.includes(legacy)) {
      emails.push(legacy);
      await writeEmails(filePath, emails);
    }
    return emails;
  });
}

export async function addAdminGmail(email, { filePath = ADMIN_GMAIL_PATH } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Địa chỉ email không hợp lệ.");

  return withFileLock(filePath, async () => {
    const emails = await readEmails(filePath);
    if (emails.includes(normalized)) return { added: false, emails };
    emails.push(normalized);
    await writeEmails(filePath, emails);
    return { added: true, emails };
  });
}

export async function removeAdminGmail(email, { filePath = ADMIN_GMAIL_PATH } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Địa chỉ email không hợp lệ.");

  return withFileLock(filePath, async () => {
    const emails = await readEmails(filePath);
    const next = emails.filter((item) => item !== normalized);
    if (next.length === emails.length) return { removed: false, emails };
    await writeEmails(filePath, next);
    return { removed: true, emails: next };
  });
}

export function isValidAdminGmail(email) {
  return Boolean(normalizeEmail(email));
}
