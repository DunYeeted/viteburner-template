import { ExpandedNS } from '../ExpandedNS';

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
