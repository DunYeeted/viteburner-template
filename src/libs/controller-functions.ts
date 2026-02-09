import { NS } from '@ns';
import { ExpandedNS } from './ExpandedNS';
import { FilesData } from './FilesData';
import { PortErrors } from './port-functions';

// Weaken is responsible for the desyncs upon leveling up
// If weakentime decreases, that results in a 4x decrease time in hack and 3.2x time in hacks
// Therefore, this means that if the change is too large, or grows to be too large, some weaken1s will occur before their corresponding hack
/** The time between each batch */
export const TIME_BETWEEN_BATCHES = 1;
export const TIME_BETWEEN_JOBS = 1;

export class RamNet {
  // Needs to be an array so we can sort it, which is necessary for largestServer
  private network: { name: string; ram: number }[];

  constructor(nsx: ExpandedNS) {
    const servers = nsx.scanAdminServers();
    // Create the network from the servers we scanned
    this.network = servers.map((name) => {
      return { name: name, ram: nsx.emptyRam(name) };
    });

    this.sortNetwork();

    nsx.ns.tprint(this.network);
  }

  get largestServer(): { name: string; ram: number } {
    this.sortNetwork();
    return this.network[this.network.length - 1];
  }

  /** Sorts the network from smallest to largest */
  private sortNetwork(): void {
    this.network.sort((a, b) => {
      return a.ram - b.ram;
    });
  }

  /**
   * Finds a server with at least the specified amount of ram
   * @returns A server or undefined if nothing is found.
   * @example findSuitableServer(1.70); // Returns 'n00dles'
   */
  public findSuitableServer(ram: number): string | undefined {
    const s = this.network.find((server) => {
      return server.ram >= ram;
    });

    if (s == undefined) return undefined;
    return s.name;
  }

  /**
   * 'Reserves' a certain amount of ram on a server so that no other script tries to use the same ram.
   * @remarks Also sorts the servers after reserving.
   */
  public reserveRam(server: string | undefined, ram: number): void {
    if (server == undefined) return;

    const s = this.network.find((serv) => {
      return serv.name === server;
    });

    if (s == undefined) throw new Error(`${server} not defined on network!`);

    s.ram -= ram;
    console.log(s);

    this.sortNetwork();
    return;
  }

  /**
   * Adds ram to a server, used to undo the effect of reserveRam
   */
  public unreserveRam(server: string | undefined, ram: number): void {
    // if (server == undefined) return;

    // const s = this.network.find((serv) => {
    //   return serv.name === server;
    // });

    // if (s == undefined) throw new Error(`${server} not defined on network!`);

    // s.ram += ram;
    this.reserveRam(server, -1 * ram);

    this.sortNetwork();
    return;
  }

  get totalRam(): number {
    return this.network.reduce((a, c) => {
      return a + c.ram;
    }, 0);
  }
}

export abstract class Batcher {
  abstract runningScripts: number[];
  port: number = PortErrors.UNDEFINED_PORT_NUM_ERROR;
  /** @description How long each weaken will take on a server, other timings can be determined from this */
  readonly hackTime: number;
  constructor(
    protected readonly nsx: ExpandedNS,
    protected readonly network: RamNet,
    readonly targetName: string,
    protected readonly maxMoney: number,
  ) {
    this.hackTime = this.nsx.ns.getHackTime(this.targetName);
  }

  abstract createBatchesList(): hwgwBatch[] | (gwBatch | wBatch)[] | gBatch[];

  /**
   * Checks if a server has the maximum amount of money and minimum security
   * @param ns
   * @param server
   * @returns True if the server has its maximum money and minimum security level
   */
  public isPrepped() {
    return (
      this.nsx.ns.getServerMaxMoney(this.targetName) == this.nsx.ns.getServerMoneyAvailable(this.targetName) &&
      this.nsx.ns.getServerMinSecurityLevel(this.targetName) == this.nsx.ns.getServerSecurityLevel(this.targetName)
    );
  }

  /**
   * @description Deploys jobs in a batch on servers, to be started later
   * @returns An array of pids for the started scripts
   * @remarks The exec'd scripts still need to be sent a start signal
   * */
  public async deployBatch(batch: gBatch | wBatch | gwBatch | hwgwBatch, batchNum: number): Promise<number[]> {
    this.checkPortNum();
    return batch.map((job, jobNum) => {
      return this.runJob(
        {
          hostServer: job.hostServer,
          type: job.type,

          target: this.targetName,

          workTime:
            job.type == JobTypes.hack
              ? this.hackTime
              : job.type == JobTypes.grow
              ? this.hackTime * 3.2
              : this.hackTime * 4,

          portNum: this.port,
          batchNum: batchNum,
          jobNum: jobNum,
        },
        job.threads,
      );
    });
  }

  /**
   * Runs a job
   * @param job Job to run
   * @returns pid of the script
   */
  protected runJob(job: IWorker, threadCount: number): number {
    const script =
      job.type == JobTypes.hack
        ? JobHelpers.Paths.hack
        : job.type == JobTypes.grow
        ? JobHelpers.Paths.grow
        : JobHelpers.Paths.weaken;
    const ramCost =
      threadCount * job.type == JobTypes.hack
        ? JobHelpers.ThreadCosts.hack
        : job.type == JobTypes.grow
        ? JobHelpers.ThreadCosts.grow
        : JobHelpers.ThreadCosts.weaken;

    return this.nsx.ns.exec(
      script,
      job.hostServer,
      { threads: threadCount, temporary: true, ramOverride: ramCost },
      JSON.stringify(job),
    );
  }

  /**
   * Send a start a start signal to the queued workers
   *
   * @param endTime The endTime of the first worker, for a batcher it would be currentTime + weakenTime * 4. The rest of the workers will calculate their own endTime
   *
   * @example Batcher.startSignal(performance.now() + Batcher.weakenTime());
   */
  public async sendStartSignal(endTime: number) {
    this.checkPortNum();
    this.nsx.ns.writePort(this.port, endTime);
    // For whatever reason, the port gets cleared right here
    // Not affected by the clearPort after this in server-prepper
    // or the peeks in HGW scripts
    await this.nsx.ns.asleep(1);
    this.nsx.ns.print(this.nsx.ns.peek(this.port));

    await this.nsx.ns.asleep(50);
    this.nsx.ns.print(this.nsx.ns.peek(this.port) + `, clearing port...`);
    this.nsx.ns.clearPort(this.port);
    this.nsx.ns.print(this.nsx.ns.peek(this.port));
  }

  private checkPortNum() {
    if (this.port == PortErrors.UNDEFINED_PORT_NUM_ERROR)
      this.nsx.scriptError(`Tried to call a deployment function before assigning this script's port`);
  }

  get weakenTime(): number {
    return this.hackTime * 4;
  }

  get growTime(): number {
    return this.hackTime * 3.2;
  }

  get totalRam(): number {
    return this.network.totalRam;
  }
}

export class JobHelpers {
  static calculateJobCost(j: IJob): number {
    switch (j.type) {
      case JobTypes.hack:
        return j.threads * this.ThreadCosts.hack;
      case JobTypes.grow:
        return j.threads * this.ThreadCosts.grow;
      case JobTypes.weaken1:
        return j.threads * this.ThreadCosts.weaken;
      case JobTypes.weaken2:
        return j.threads * this.ThreadCosts.weaken;
    }
  }

  static calculateServerlessJobCost(threads: number, jobType: JobTypes): number {
    switch (jobType) {
      case JobTypes.hack:
        return threads * this.ThreadCosts.hack;
      case JobTypes.grow:
        return threads * this.ThreadCosts.grow;
      case JobTypes.weaken1:
        return threads * this.ThreadCosts.weaken;
      case JobTypes.weaken2:
        return threads * this.ThreadCosts.weaken;
    }
  }

  static isServerDefined(j: IJob) {
    return j.hostServer == undefined;
  }

  /** @description Calculates the number of threads for a given hackThread count */
  static calcWeaken1Threads(hackThreads: number) {
    return Math.ceil(hackThreads / 25);
  }

  /** @description Calculates the number of threads for a given growThread count */
  static calcWeaken2Threads(growThreads: number) {
    return Math.ceil(growThreads / 12.5);
  }

  /** @description Cost to run a single thread of each script */
  static ThreadCosts = {
    hack: FilesData['HackWorker'].ramCost,
    grow: FilesData['GrowWorker'].ramCost,
    weaken: FilesData['WeakenWorker'].ramCost,
  };

  /** @description Paths to each scripts */
  static Paths = {
    hack: FilesData['HackWorker'].path,
    grow: FilesData['GrowWorker'].path,
    weaken: FilesData['WeakenWorker'].path,
  };
}

export class BatchHelpers {
  /** The buffer given to scripts to read the port and react */
  static BufferTime = 10;
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

  /** @description How long the corresponding function will take to execute */
  readonly workTime: number;
  /** @description Number of the port for the batcher */
  readonly portNum: number;

  /** @description The batches' number */
  readonly batchNum: number;
  /** @description The job's number in the batch */
  readonly jobNum: number;
}

export enum JobTypes {
  hack,
  weaken1,
  grow,
  weaken2,
}
