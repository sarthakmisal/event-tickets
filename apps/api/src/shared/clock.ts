/** Injected wherever "now" matters so tests can control time. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
