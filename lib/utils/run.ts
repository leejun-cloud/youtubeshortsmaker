import { spawn } from 'node:child_process';

export const run = async (cmd: string, args: string[], quiet = false): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stderr = '';
    if (quiet) {
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
    });
  });
};

export const runCapture = async (cmd: string, args: string[]): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${cmd} exited with code ${code}: ${stderr || stdout}`));
    });
  });
};
