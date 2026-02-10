export enum JobTypes {
  hack,
  weaken1,
  grow,
  weaken2,
}

export const Timing = {
  betweenBatches: 1,
  betweenJobs: 1,
  /** The buffer given to scripts to read the port and react */
  buffer: 10,
} as const;

export const WeakenInfo = {
  fortifyAmt: 0.002,
  weakenAmt: 0.05,
} as const;
