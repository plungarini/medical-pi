import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE_STORAGE_PATH = process.env.BASE_STORAGE_PATH || './data/medical-pi';

export function ensureStorage(): void {
  const dirs = [
    BASE_STORAGE_PATH,
    path.join(BASE_STORAGE_PATH, 'documents'),
    path.join(BASE_STORAGE_PATH, 'logs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function saveFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): { path: string; relativePath: string } {
  ensureStorage();

  const fileExt = path.extname(fileName);
  const hash = crypto.randomUUID();
  const safeFileName = `${hash}${fileExt}`;

  const userDir = path.join(BASE_STORAGE_PATH, 'documents', userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const filePath = path.join(userDir, safeFileName);
  fs.writeFileSync(filePath, buffer);

  return {
    path: filePath,
    relativePath: `documents/${userId}/${safeFileName}`,
  };
}

export function getFile(relativePath: string): Buffer | null {
  const fullPath = path.join(BASE_STORAGE_PATH, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath);
}

export function deleteFile(relativePath: string): boolean {
  const fullPath = path.join(BASE_STORAGE_PATH, relativePath);
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  fs.unlinkSync(fullPath);
  return true;
}

export function fileExists(relativePath: string): boolean {
  const fullPath = path.join(BASE_STORAGE_PATH, relativePath);
  return fs.existsSync(fullPath);
}
