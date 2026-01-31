import { NetscriptPort, NS } from '@ns';
import { ExpandedNS } from './ExpandedNS';
import { FilesData } from './FilesData';

// Weaken is responsible for the desyncs upon leveling up
// If weakentime decreases, that results in a 4x decrease time in hack and 3.2x time in hacks
// For example, this means that if the change is too large, or grows to be too large, some weaken1s will occur before their corresponding hack

/**
 * @description The time difference between two workers in a batch ending, in ms.
 *
 * @default TIME_BETWEEN_WORKERS = 5
 *
 * @example hack ends |---5 ms---| weaken1 ends
 */
const TIME_BETWEEN_WORKERS = 5;

const CONNECTION_ATTEMPTS = 5;
const RECONNECT_TIME = 5;

export class RamNet {
  // Needs to be an array so we can sort it, which is necessary for largestServer
  private network: { server: string; ram: number }[];

  constructor(nsx: ExpandedNS) {
    const servers = nsx.scanServers();
    this.network = [];

    // Create an array from the servers we scanned
    for (let i = 0; i < servers.length; i++) {
      this.network[i] = { server: servers[i], ram: nsx.emptyRam(servers[i]) };
    }
    this.sortNetwork();
  }

  get largestServer(): string {
    this.sortNetwork();
    return this.network[0].server;
  }

  private sortNetwork(): void {
    this.network.sort((a, b) => {
      return a.ram - b.ram;
    });
  }

  /**
   * findSuitableServer
   * @returns A server with the specified amount of ram or undefined if nothing is found.
   * @example findSuitableServer(1.70); // Returns 'n00dles'
   */
  public findSuitableServer(ram: number): string | undefined {
    const s = this.network.find((server) => {
      server.ram > ram;
    });

    if (s == undefined) return undefined;
    return s.server;
  }

  /**
   * 'Reserves' a certain amount of ram on a server so that no other script tries to use the same ram.
   * Also sorts the servers after reserving.
   */
  public reserveRam(server: string | undefined, ram: number): void {
    if (server == undefined) return;

    const s = this.network.find((s) => {
      return s.server === server;
    });

    if (s == undefined) throw new Error(`${server} not defined on network!`);

    s.ram -= ram;

    this.sortNetwork();
    return;
  }

  /**
   * Adds ram to a server, effectively undoing any reservations from before
   */
  public unreserveRam(server: string | undefined, ram: number): void {
    if (server == undefined) return;

    const s = this.network.find((s) => {
      return s.server === server;
    });

    if (s == undefined) throw new Error(`${server} not defined on network!`);

    s.ram += ram;

    this.sortNetwork();
    return;
  }
}

export abstract class Batcher {
  constructor(
    protected readonly nsx: ExpandedNS,
    protected readonly network: RamNet,
    readonly targetName: string,
    protected readonly maxMoney: number,
    protected port: NetscriptPort | undefined,
    /** @description How long each weaken will take on a server, other timingscan be determined from this */
    readonly hackTime: number,
  ) {}

  abstract createBatchesList(nsx: ExpandedNS, network: RamNet): hwgwBatch[] | gwBatch[] | wBatch[] | gBatch[];

  /**
   * Checks if a server has the maximum amount of money and minimum security
   * @param ns
   * @param server
   * @returns True if the server has its maximum money and minimum security level
   */
  public static isPrepped(ns: NS, server: string) {
    return (
      ns.getServerMaxMoney(server) == ns.getServerMoneyAvailable(server) &&
      ns.getServerMinSecurityLevel(server) == ns.getServerSecurityLevel(server)
    );
  }

  /**
   * @description Executes jobs in a batch on servers
   *
   * Pauses after each one to redetermine time offsets, which could lower efficiency (especially in smaller batches).
   * The pause also prevents the port from filling up.
   * */
  public runBatch(batch: gBatch | wBatch | gwBatch | hwgwBatch, batchArgs: WorkerArgs): void {
    const workers: [number, JobTypes, number][] = [];

    for (let i = 0; i < batch.length; i++) {
      const job = batch[i];
      workers.push([
        this.runJob({
          hostServer: job.hostServer,
          type: job.type,

          target: batchArgs.target,

          endTime: batchArgs.endTime + i * TIME_BETWEEN_WORKERS,
          workTime: job.type === `grow` ? this.hackTime * 3.2 : job.type === `hack` ? this.hackTime : this.hackTime * 4,

          portNum: batchArgs.portNum,
        }),
        job.type,
        performance.now(),
      ]);
    }
  }

  protected runJob(j: IWorker): number {
    const script =
      j.type === `grow`
        ? FilesData[`growWorker`].path
        : j.type === `hack`
        ? FilesData[`hackWorker`].path
        : FilesData[`weakenWorker`].path;

    return this.nsx.ns.exec(script, j.hostServer, { temporary: true }, JSON.stringify(j));
  }

  /**
   * @description Changes ending time of workers so that occur in order regardless of their startTime
   *
   * Depends on behavior of hgw scripts
   * @param workers A tuple of the pid, type, and startTime (from performance.now()) of the script
   * @returns An array of the pids for the scripts it started, or undefined if it cancelled early
   */
  public async bufferTimeChange(
    workers: [pid: number, type: JobTypes, startTime: number][],
  ): Promise<number[] | undefined> {
    if (this.port === undefined) {
      this.nsx.scriptError(`Port of ${this.nsx.ns.getScriptName()} was undefined`);
    }

    let accumulatedWaitTime = 0;
    for (let job = 0; job < workers.length; job++) {
      // Try to connect right now
      for (let i = 0; i <= CONNECTION_ATTEMPTS; i++) {
        if (this.port.empty()) {
          // If we failed too many times, stop the batch from running
          if (i == CONNECTION_ATTEMPTS) {
            this.terminateWorkers(
              workers.map((worker) => {
                return worker[0];
              }),
            );
            this.nsx.ns.print(`Failed to run a batch`);
            return;
          }
          // Otherwise, try to reconnect again later
          await this.nsx.ns.asleep(RECONNECT_TIME);
        }
      }
      // Get the pid
      const scriptPid: number = this.port.read();
      const script = workers[job];
      // If this script wasn't the right one, then terminate
      if (scriptPid != script[0]) {
        this.terminateWorkers(
          workers.map((worker) => {
            return worker[0];
          }),
        );
        return;
      }
      // Send the port an offset
      // Offset is the wait time from the other scripts so it runs after them,
      // The wait time between execing the script and eventually reading the port right now
      const timeBetweenStartAndRead = performance.now() - script[2];
      this.port.write(JSON.stringify([scriptPid, accumulatedWaitTime + timeBetweenStartAndRead]));
      accumulatedWaitTime += timeBetweenStartAndRead;
    }

    return workers.map(([pid, _x, _y]) => {
      return pid;
    });
  }

  /**
   * Terminates a certain number of the most recent workers to run
   * @param workersToTerminate How many of the last workers to terminate
   */
  public terminateWorkers(pidsToTerminate: number[]): void {
    pidsToTerminate.forEach((pid) => {
      this.nsx.ns.kill(pid);
    });
  }
}

export class JobHelpers {
  static calculateJobCost(j: IJob): number {
    switch (j.type) {
      case 'hack':
        return j.threads * jobRamCost.hack;
      case 'grow':
        return j.threads * jobRamCost.grow;
      case 'weaken1':
        return j.threads * jobRamCost.weaken;
      case 'weaken2':
        return j.threads * jobRamCost.weaken;
    }
  }

  static calculateServerlessJobCost(threads: number, jobType: JobTypes): number {
    switch (jobType) {
      case 'hack':
        return threads * jobRamCost.hack;
      case 'grow':
        return threads * jobRamCost.grow;
      case 'weaken1':
        return threads * jobRamCost.weaken;
      case 'weaken2':
        return threads * jobRamCost.weaken;
    }
  }

  static isServerDefined(j: IJob) {
    return j.hostServer == undefined;
  }
}

export class BatchHelpers {
  /** Unreserves the ram for this batch on ramnet */
  static reserveBatch(network: RamNet, batch: gBatch | wBatch | gwBatch | hwgwBatch): void {
    for (const job of batch) {
      network.reserveRam(job.hostServer, JobHelpers.calculateJobCost(job));
    }
  }

  /** Reserves the ram for this batch on ramnet */
  static unreserveBatch(network: RamNet, batch: gBatch | wBatch | gwBatch | hwgwBatch): void {
    for (const job of batch) {
      network.unreserveRam(job.hostServer, JobHelpers.calculateJobCost(job));
    }
  }
}

/**
 * @description For experience farm batchers
 *
 * Types: ['grow']
 */
export type gBatch = [IJob];
/**
 * @description For the first stage of server-preparers, where the only job is weakening the server
 *
 * Types: ['weaken']
 * */
export type wBatch = [IJob];
/**
 * @descriptionFor the second part of preppers, where you are maxing money and keeping security as low as possible
 *
 * Types in order: ['grow', 'weaken']
 * */
export type gwBatch = [IJob, IJob];
/**
 * @description For full fledged batchers
 *
 * Types in order: ['hack', 'weaken1', 'grow', 'weaken2']
 */
export type hwgwBatch = [IJob, IJob, IJob, IJob];

/** @description Holds the necessary for running the script in servers */
export interface IJob {
  readonly type: JobTypes;
  threads: number;
  hostServer: string;
}

/** @description The args that get passed to a HGW script */
export interface IWorker {
  /** @description The server this job runs on (Used in log) */
  readonly hostServer: string;
  /** @description This job's type (Used in log) */
  readonly type: JobTypes;

  /** @description The server to target */
  readonly target: string;

  /** @description When this job should finish */
  readonly endTime: number;
  /** @description How long the corresponding function will take to execute */
  readonly workTime: number;
  /** @description Number of the port for the batcher */
  readonly portNum: number;
}

/** @description Info only needed once actually running the job */
export interface WorkerArgs {
  /** @description The time at which the first job of a batch should finish */
  readonly endTime: number;
  /** @description The server the jobs should target */
  readonly target: string;
  /** @description The port for the batcher */
  readonly portNum: number;
}

type JobTypes = `hack` | `grow` | `weaken1` | `weaken2`;

enum jobRamCost {
  hack = 1.7,
  grow = 1.75,
  weaken = 1.75,
}
