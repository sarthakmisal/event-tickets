// `npm start` — runs the API (:3000) and the web panel (:5173) together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const children = ['dev:api', 'dev:web'].map((script) =>
    spawn('npm', ['run', script], { stdio: 'inherit', shell: true }),
);

let stopping = false;
function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill();
    process.exit(code);
}

for (const child of children) child.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());