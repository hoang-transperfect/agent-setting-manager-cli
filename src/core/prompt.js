import { createInterface } from 'node:readline';

export function askOverwrite(name) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`'${name}' already exists — [s]top or [o]verwrite? `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'o' ? 'overwrite' : 'stop');
    });
  });
}
