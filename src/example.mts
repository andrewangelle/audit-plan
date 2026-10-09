import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readExample() {
  const filePath = join(process.cwd(), './src/example.json');
  const file = await readFile(filePath, 'utf-8');

  return JSON.parse(file);
}
