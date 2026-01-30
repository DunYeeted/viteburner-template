import { NS } from '@ns';
import { ExpandedNS } from './ExpandedNS';

export class RamNet {
  private network: { server: string, ram: number }[];
  constructor(nsx: ExpandedNS) {
    const servers = nsx.scanServers();
    this.network = [];
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
  public reserveRamOnServer(server: string | undefined, ram: number): void {
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
  public undoReserve(server: string | undefined, ram: number): void {
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
  abstract createSingleBatch(nsx: ExpandedNS, network: RamNet): IHWGWBatch | IGWBatch | IWBatch | IGBatch;

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

export class JobsHelpers {
  static calculateJobCost(j: Job): number {
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

  static isServerDefined(j: Job) {
    return j.hostServer == undefined;
  }
}

export function runJob(ns: NS, j: Job, targetServer: string) {
  const script =
    j.type === `grow` ? `./workers/grow.js` : j.type === `hack` ? `./workers/hack.js` : `./workers/weaken.js`;

  ns.exec(script, j.hostServer, { temporary: true }, )
}

// For experience farm batchers
export interface IGBatch {
  grow: Job;
  unreserveBatch(network: RamNet): void;
  reserveBatch(network: RamNet): void;
  assignBatch(ns: NS, endTime: number): void;
}
// For the first part of preppers, where the only job is weakening the server
export interface IWBatch {
  weaken1: Job;
  unreserveBatch(network: RamNet): void;
  reserveBatch(network: RamNet): void;
  assignBatch(ns: NS, endTime: number): void;
}
// For the second part of preppers, where you are maxing money and keeping security as low as possible
export interface IGWBatch extends IGBatch {
  weaken2: Job;
}
// For full fledged batchers
export interface IHWGWBatch extends IGWBatch, IWBatch {
  hack: Job;
}
export interface Job {
  readonly type: jobTypes;
  threads: number;
  hostServer: string;
}

type jobTypes = `hack` | `grow` | `weaken1` | `weaken2`;

enum jobRamCost {
  hack = 1.7,
  grow = 1.75,
  weaken = 1.75,
}
