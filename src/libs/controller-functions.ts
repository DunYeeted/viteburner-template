import { NS } from '@ns';
import { ExpandedNS } from './ExpandedNS';

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
  abstract createSingleBatch(nsx: ExpandedNS, network: RamNet): hwgwBatch | gwBatch | wBatch | gBatch;

  /**
   * Checks if a server has the maximum amount of money and minimum security
   * @param ns
   * @param server
   * @returns True if the server has its maximum money and minimum security level
   */
  public isPrepped(ns: NS, server: string) {
    return (
      ns.getServerMaxMoney(server) == ns.getServerMoneyAvailable(server) &&
      ns.getServerMinSecurityLevel(server) == ns.getServerSecurityLevel(server)
    );
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

  static calculateServerlessJobCost(threads: number, jobType: jobTypes): number {
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

  /**
   * Executes jobs in a batch on servers
   * */
  static runBatch(ns: NS, batch: gBatch | wBatch | gwBatch | hwgwBatch, batchArgs: WorkerArgs): void {
    let i = 0;
    for (const job of batch) {
      BatchHelpers.runJob(ns, {
        hostServer: job.hostServer,
        type: job.type,

        target: batchArgs.target,

        endTime: batchArgs.endTime + i * TIME_BETWEEN_WORKERS,
        workTime: batchArgs.weakenTime,

        portNum: batchArgs.portNum,
      });
      i++;
    }
  }

  static runJob(ns: NS, j: IWorker): number {
    const script =
      j.type === `grow` ? `./workers/grow.js` : j.type === `hack` ? `./workers/hack.js` : `./workers/weaken.js`;

    return ns.exec(script, j.hostServer, { temporary: true }, JSON.stringify(j));
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
  readonly type: jobTypes;
  threads: number;
  hostServer: string;
}

/** @description The args that get passed to a HGW script */
export interface IWorker {
  /** @description The server this job runs on (Used in log) */
  readonly hostServer: string;
  /** @description This job's type (Used in log) */
  readonly type: jobTypes;

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
  /** @description How long each weaken will take on a server, other timingscan be determined from this */
  readonly weakenTime: number;
  /** @description The port for the batcher */
  readonly portNum: number;
}

type jobTypes = `hack` | `grow` | `weaken1` | `weaken2`;

enum jobRamCost {
  hack = 1.7,
  grow = 1.75,
  weaken = 1.75,
}
