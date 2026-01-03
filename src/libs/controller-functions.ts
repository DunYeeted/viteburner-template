import { NS } from '@ns';
import { ExpandedNS } from './ExpandedNS';

export class RamNet extends Array {
  constructor(nsx: ExpandedNS) {
    super();
    const servers = nsx.fullScan();
    for (let i = 0; i < servers.length; i++) {
      this[i] = [servers[i], nsx.emptyRam(servers[i])];
    }
    this.sortNetwork();
  }

  get largestServer(): string {
    this.sortNetwork();
    return this[0][0];
  }

  private sortNetwork(): void {
    this.sort((a, b) => {
      return a[1] - b[1];
    });
  }

  /**
   * findSuitableServer
   * @returns A server with the specified amount of ram or undefined if nothing is found.
   * @example findSuitableServer(1.70); // Returns 'n00dles'
   */
  public findSuitableServer(ram: number): string | undefined {
    const s = this.find((server) => {
      server[1] > ram;
    });

    if (s == undefined) return undefined;
    return s[0];
  }

  /**
   * 'Reserves' a certain amount of ram on a server so that no other script tries to use the same ram.
   * Also sorts the servers after reserving.
   */
  public reserveRamOnServer(server: string | undefined, ram: number): void {
    if (server == undefined) return;

    const s = this.find((s) => {
      return s[0] === server;
    });

    if (s == undefined) throw new Error(`${server} not defined on network!`);

    s[1] -= ram;

    this.sortNetwork();
    return;
  }

  /**
   * Adds ram to a server, effectively undoing any reservations from before
   */
  public undoReserve(server: string | undefined, ram: number): void {
    if (server == undefined) return;

    const s = this.find((s) => {
      return s[0] === server;
    });

    if (s == undefined) throw new Error(`${server} not defined on network!`);

    s[1] += ram;

    this.sortNetwork();
    return;
  }

  public reserveBatch(b: Batch): void {
    this.reserveRamOnServer(b.grow.server, calculateJobCost(b.grow));
    this.reserveRamOnServer(b.hack.server, calculateJobCost(b.hack));
    this.reserveRamOnServer(b.weaken1.server, calculateJobCost(b.weaken1));
    this.reserveRamOnServer(b.weaken2.server, calculateJobCost(b.weaken2));
  }

  public undoReserveBatch(b: Batch): void {
    this.undoReserve(b.grow.server, calculateJobCost(b.grow));
    this.undoReserve(b.hack.server, calculateJobCost(b.hack));
    this.undoReserve(b.weaken1.server, calculateJobCost(b.weaken1));
    this.undoReserve(b.weaken2.server, calculateJobCost(b.weaken2));
  }
}

/**
 * Checks if a server has the maximum amount of money and minimum security
 * @param ns
 * @param server
 * @returns True if the server has its maximum money and minimum security level
 */
export function isPrepped(ns: NS, server: string) {
  return (
    ns.getServerMaxMoney(server) == ns.getServerMoneyAvailable(server) &&
    ns.getServerMinSecurityLevel(server) == ns.getServerSecurityLevel(server)
  );
}

export function calculateJobCost(j: Job): number {
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

export function calculateServerlessJobCost(threads: number, jobType: jobTypes): number {
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

export function isServerDefined(j: Job) {
  return j.server == undefined;
}

export interface Batch {
  readonly hack: Job;
  readonly weaken1: Job;
  readonly grow: Job;
  readonly weaken2: Job;
}

export interface Job {
  readonly type: jobTypes;
  readonly threads: number;
  readonly server: string;
}

type jobTypes = `hack` | `grow` | `weaken1` | `weaken2`;

enum jobRamCost {
  hack = 1.7,
  grow = 1.75,
  weaken = 1.75,
}
