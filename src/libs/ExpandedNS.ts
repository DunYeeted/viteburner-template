import { NS, ScriptArg } from '@ns';

export class ExpandedNS {
  public ns: NS;
  constructor(ns: NS) {
    this.ns = ns;
  }

  /**
   * fullScan
   * @returns An array of all servers
   */
  fullScan(): string[] {
    const scanList: string[] = this.ns.scan();
    scanList.forEach((s) => {
      scanList.push(
        ...this.ns.scan(s).filter((s1) => {
          !scanList.includes(s1);
        }),
      );
    });
    return scanList;
  }

  fullRoot(): void {
    for (const server of this.fullScan()) {
      switch(this.ns.getServerNumPortsRequired(server)) {
        case 5:
          try {
            this.ns.sqlinject(server);
          } catch {
            return;
          }
        // eslint-disable-next-line no-fallthrough
        case 4:
          try {
            this.ns.httpworm(server);
          } catch {
            return;
          }
        // eslint-disable-next-line no-fallthrough
        case 3:
          try {
            this.ns.relaysmtp(server);
            // eslint-disable-next-line prettier/prettier
          } catch {
            return;
          }
        // eslint-disable-next-line no-fallthrough
        case 2:
          try {
            this.ns.ftpcrack(server);
            // eslint-disable-next-line prettier/prettier
          } catch {
            return;
          }
        // eslint-disable-next-line no-fallthrough
        case 1:
          try {
            this.ns.brutessh(server);
            // eslint-disable-next-line prettier/prettier
          } catch {
            return;
          }
      }
      if (this.ns.nuke(server)) this.ns.toast(`Rooted ${server}`, `success`);
    }
  }

  /**
   * emptyRam
   * @returns The amount of unused ram on a server
   */
  emptyRam(server: string): number {
    return this.ns.getServerMaxRam(server) - this.ns.getServerUsedRam(server);
  }

  /**
   * A function to run something with no (permanent) ram costs (RAM dodger). This is a very simple implementation so don't expect to be able to use it for everything.
   * @remarks This function also costs 1.0 GB of ram to run itself, so anything less than that is unnecessary.
   * @param func Function to run
   * @param args Any arguments to pass to the function
   */
  async tempFunction(func: string) {
    this.ns.write(
      `temp/${this.ns.pid}.js`,
      `export async function main(ns) {
  ns.write('temp/${this.ns.pid}.txt', JSON.stringify(${func}), 'w'
}`,
      'w',
    );
    await this.ns.asleep(0);
    this.ns.run(`temp/${this.ns.pid}.js`);
    const data = JSON.parse(this.ns.read(`temp/${this.ns.pid}.txt`));
    this.ns.rm(`temp/${this.ns.pid}.txt`);
    return data;
  }
}
