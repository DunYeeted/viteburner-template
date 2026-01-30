// IMPORTANT: Make sure that this script has as little imports as possible, preferably none
import { NS } from '@ns';

export class ExpandedNS {
  public ns: NS;
  constructor(ns: NS) {
    this.ns = ns;
  }

  /**
   * fullScan
   * @returns An array of all servers
   */
  scanServers(): string[] {
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
    for (const server of this.scanServers()) {
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

  /**
   * Calculates the number of threads necessary to raise money on a server to a certain amount (Lowkey ripped from the source code).
   * @returns The number of growThreads needed to grow a server to a certain amount of money, to the next smallest integer.
   * @link https://github.com/bitburner-official/bitburner-src/blob/df6c5073698e76390e2d163d91df2fde72404c66/src/Server/ServerHelpers.ts#L93
   * @remarks Essentially does the same thing as ns.formulas.hacking.growThreads() but for a much lower ram cost.
   * @param server The name of the server
   * @param startMoney How much money the server starts with, if undefined, it assumes starting at the current money.
   * @param targetMoney How much money the server ends with, if undefined, it assumes the max money.
   */
  calcGrowThreads(
    server: string,
    startMoney: number = this.ns.getServerMoneyAvailable(server),
    targetMoney: number = this.ns.getServerMaxMoney(server),
  ) {
    const serverGrowth = this.ns.getServerGrowth(server);

    // Initial guess for the number of threads since we're doing a newtonian approximation and need one
    let threads = (targetMoney - startMoney) / (1 + (targetMoney * (1 / 16) + startMoney * (15 / 16)) * serverGrowth);
    let diff: number;
    do {
      // Each thread adds $1, this is how we account for that
      const startingMoney = startMoney + threads;

      const newThreads =
        (threads - startingMoney * Math.log(startingMoney / targetMoney)) / (1 + startingMoney * serverGrowth);

      diff = newThreads - threads;
      threads = newThreads;
    } while (Math.abs(diff) < 1);
    // The actual function has some more checking for edge cases here which I might need to do if I run into the too often, but it should be fine enough
    return Math.ceil(threads);
  }

  /**
   * Read an object from a port as a specified type
   * @param portNum Port to read from
   * @returns The object as the type assigned
   */
  readObjFromPort<t>(portNum: number): t {
    return JSON.parse(this.ns.readPort(portNum));
  }

  /**
   * Terminates all scripts on all servers
   * @param runHome Whether to restart adaOS
   */
  clearServers(runHome = true): never {
    this.scanServers().forEach((server) => {
      this.ns.killall(server, runHome);
    });

    this.ns.spawn(`./daemons/adaOS.js`);
    // Spawn already terminates the current script, this is just for the script to properly return 'never'
    this.ns.exit();
  }

  checkForDuplicateScripts(): boolean {
    return this.ns.isRunning(this.ns.getScriptName(), this.ns.getHostname(), ...this.ns.args);
  }

  scriptError(errorMessage: string): never {
    this.ns.tprint(errorMessage);
    throw new Error(errorMessage);
  }
}
