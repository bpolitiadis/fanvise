import { config } from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';

export const loadEnv = (): void => {
  const localPath = resolve(process.cwd(), '.env.local');
  if (fs.existsSync(localPath)) {
    config({ path: localPath });
    return;
  }

  config();
};
