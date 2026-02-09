export enum JobTypes {
  hack,
  weaken1,
  grow,
  weaken2,
}

export enum Timing {
  betweenBatches = 1,
  betweenJobs = 1,
  /** The buffer given to scripts to read the port and react */
  buffer = 10,
}
