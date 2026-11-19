import type { Logger } from '../shared/logger';

export interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/** Minimal in-process scheduler: one job at a time per name, errors logged and never thrown. */
export function startJobs(jobs: Job[], log: Logger): () => void {
  const timers = jobs.map((job) => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error({ err, job: job.name }, 'job failed');
      } finally {
        running = false;
      }
    };
    return setInterval(() => void tick(), job.everyMs);
  });
  return () => timers.forEach(clearInterval);
}
