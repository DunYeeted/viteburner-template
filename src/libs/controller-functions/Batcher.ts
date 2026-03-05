import { ExpandedNS } from '../ExpandedNS';
import { FilesData } from '../FilesData';
import { PortErrors } from '../Ports';
import { JobTypes, Timing, WeakenInfo } from './Constants';
import { RamNet } from './RamNet';

export abstract class Batcher {
  port: number = PortErrors.UNDEFINED_PORT_NUM_ERROR;
  /** @description How long each weaken will take on a server, other timings can be determined from this */
  public hackTime: number;
  protected readonly _maxMoney: number;
  protected readonly _minSecurity: number;
  /** The server's growth parameter */
  protected readonly serverGrowth: number;
  protected playerGrowthMulti: number;
  protected readonly bitnodeGrowthMulti: number;

  private _workersRunning: number;
  private _lastScriptPID: number;

  public lvl: number;
  constructor(protected readonly nsx: ExpandedNS, protected network: RamNet, readonly targetName: string) {
    this.hackTime = this.nsx.ns.getHackTime(this.targetName);
    this._maxMoney = this.nsx.ns.getServerMaxMoney(this.targetName);
    this._minSecurity = nsx.ns.getServerMinSecurityLevel(targetName);

    this.serverGrowth = nsx.ns.getServerGrowth(targetName);
    const player = nsx.ns.getPlayer();
    this.playerGrowthMulti = player.mults.hacking_grow;
    this.bitnodeGrowthMulti = 1;
    this.lvl = player.skills.hacking;

    this._workersRunning = 0;
    this._lastScriptPID = 0;
  }

  abstract createBatchesList(): BatchList;

  /**
   * updatePlayerStats
   */
  public updatePlayerStats(): void {
    const player = this.nsx.ns.getPlayer();
    this.playerGrowthMulti = player.mults.hacking_grow;
    this.lvl = player.skills.hacking;
  }

  /**
   * Checks if a server has the maximum amount of money and minimum security
   * @param ns
   * @param server
   * @returns True if the server has its maximum money and minimum security level
   */
  public get isPrepped(): boolean {
    return (
      this._maxMoney == this.nsx.ns.getServerMoneyAvailable(this.targetName) &&
      this._minSecurity == this.nsx.ns.getServerSecurityLevel(this.targetName)
    );
  }

  public resetNetwork(): void {
    this.network = new RamNet(this.nsx);
  }

  /**
   * Runs all batches and then sends the start signal
   * @param batches
   * @returns The endTime of the first script
   */
  public async runAllBatches(batches: BatchList): Promise<number> {
    // Run each batch
    let batchNum = 0;
    for (const batch of batches) {
      await this.deployBatch(batch, batchNum);
      batchNum++;
    }
    await this.nsx.ns.asleep(Timing.buffer);
    // Need to give the start signal to the queued workers
    const endTime = performance.now() + this.weakenTime + JobHelpers.BufferTime;
    await this.sendStartSignal(endTime);

    return endTime;
  }

  /**
   * @description Deploys jobs in a batch on servers, to be started later
   * @returns An array of pids for the started scripts
   * @remarks The exec'd scripts still need to be sent a start signal
   * */
  private async deployBatch(batch: Batch, batchNum: number): Promise<void> {
    this.checkPortNum();
    let jobNum = 0;
    for (const job of batch) {
      this._lastScriptPID = this.runJob(
        {
          hostServer: job.hostServer,
          type: job.type,

          target: this.targetName,

          workTime:
            job.type == JobTypes.hack ? this.hackTime : job.type == JobTypes.grow ? this.growTime : this.weakenTime,

          portNum: this.port,
          batchNum: batchNum,
          jobNum: jobNum,
        },
        job.threads,
      );
      jobNum++;
      this._workersRunning++;
      await this.nsx.ns.asleep(0);
    }

    return;
  }

  /**
   * Runs a job
   * @param job Job to run
   * @returns pid of the script
   */
  private runJob(job: IWorker, threadCount: number): number {
    const script =
      job.type == JobTypes.hack
        ? JobHelpers.Paths.hack
        : job.type == JobTypes.grow
        ? JobHelpers.Paths.grow
        : JobHelpers.Paths.weaken;

    return this.nsx.ns.exec(script, job.hostServer, { threads: threadCount, temporary: true }, JSON.stringify(job));
  }

  /**
   * Send a start a start signal to the queued workers
   *
   * @param endTime The endTime of the first worker, for a batcher it would be currentTime + weakenTime * 4. The rest of the workers will calculate their own endTime
   *
   * @example Batcher.startSignal(performance.now() + Batcher.weakenTime());
   */
  public async sendStartSignal(endTime: number): Promise<void> {
    this.checkPortNum();
    this.nsx.ns.writePort(this.port, endTime);
    // For whatever reason, the port gets cleared right here
    // Not affected by the clearPort after this in server-prepper
    // or the peeks in HGW scripts

    await this.nsx.ns.asleep(50);
    this.nsx.ns.clearPort(this.port);
  }

  public async waitForFinish(endTime: number): Promise<void> {
    await this.nsx.ns.asleep(endTime - performance.now());
    do {
      await this.nsx.ns.asleep(1000);
      if (!this.nsx.ns.isRunning(this._lastScriptPID)) {
        break;
      }
    } while (true);
    this._workersRunning = 0;

    return;
  }

  /**
   * Checks if the port is undefined, used to throw an error
   */
  private checkPortNum(): void {
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

  get maxMoney(): number {
    return this._maxMoney;
  }

  get workersRunning(): number {
    return this._workersRunning;
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

export type Batch = gBatch | (wBatch | gwBatch) | hwgwBatch;
export type BatchList = gBatch[] | (wBatch | gwBatch)[] | hwgwBatch[];

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

  /** @description Calculates the number of threads for a given thread count */
  static calcWeakenThreads(type: JobTypes, threads: number) {
    const typeMult = type == JobTypes.hack ? 1 : 2;
    return (threads * WeakenInfo.fortifyAmt * typeMult) / WeakenInfo.weakenAmt;
  }

  /** @description Cost to run a single thread of each script */
  static ThreadCosts = {
    hack: 1.7,
    grow: 1.75,
    weaken: 1.75,
  };

  /** Extra time given in case the script takes too long */
  static BufferTime = 1000;

  /** @description Paths to each scripts */
  static Paths = {
    hack: FilesData['HackWorker'].path,
    grow: FilesData['GrowWorker'].path,
    weaken: FilesData['WeakenWorker'].path,
  };
}

export class BatchHelpers {
  /** Unreserves the ram for this batch on ramnet */
  static reserveBatch(network: RamNet, batch: Batch): void {
    for (const job of batch) {
      network.reserveRam(job.hostServer, JobHelpers.calculateJobCost(job));
    }
  }

  /** Reserves the ram for this batch on ramnet */
  static unreserveBatch(network: RamNet, batch: Batch): void {
    for (const job of batch) {
      network.unreserveRam(job.hostServer, JobHelpers.calculateJobCost(job));
    }
  }
}
