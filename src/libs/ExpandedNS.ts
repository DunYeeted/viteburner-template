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
    return JSON.parse(this.ns.peek(portNum));
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
    return this.ns.scriptRunning(this.ns.getScriptName(), this.ns.getHostname());
  }

  scriptError(errorMessage: string): never {
    this.ns.tprint(errorMessage);
    this.ns.print(`Error!\n` + errorMessage);
    throw new Error(errorMessage);
  }

  /**
   * Check for if a port-controller is running, since most scripts need it.
   * @returns True if a port-controller is currently running
   */
  checkForPortController(): boolean {
    return this.ns.scriptRunning(PORT_CONTROLLER_FILENAME, `home`);
  }

  /**
   * Request a port from port-controller
   * @param portName If defined port-controller will remember this port so other scripts can communicate with this script
   * @returns A free and open port
   */
  async requestPort(portName: string | null): Promise<number> {
    const requestArgs: PortRequest = {
      type: RequestTypes.requesting,
      identifier: this.ns.pid,
      portName: portName,
    };
    this.ns.writePort(ReservedPorts.requestPort, JSON.stringify(requestArgs));
    const fulfilledRequestPort = this.ns.getPortHandle(ReservedPorts.fulfilledRequestsPort);

    do {
      // If there is something already, we want to read it immediately
      // If a lot of scripts keep trying to read from this port, that could cause some issues
      // By waiting for this, it should slow them down enough to not worry about it
      await this.ns.sleep(0);
      if (fulfilledRequestPort.empty()) await this.ns.nextPortWrite(ReservedPorts.fulfilledRequestsPort);

      const possibleFulfilledRequest: FulfilledPortRequest = this.readObjFromPort<FulfilledPortRequest>(
        ReservedPorts.fulfilledRequestsPort,
      );

      // This is this script's fulfilled port request
      if (possibleFulfilledRequest.scriptID == requestArgs.identifier) {
        // Remove from the queue so other scripts don't try to read this
        fulfilledRequestPort.read();
        // Clear the port before using
        this.ns.clearPort(possibleFulfilledRequest.portNum);
        // Throw an error if someone else already had this portName
        if (possibleFulfilledRequest.portNum == PortErrors.DuplicatePortNameError)
          this.scriptError(
            `Port name is duplicated, usually happens when running a script twice when only supposed to be run once`,
          );
        if (possibleFulfilledRequest.portNum == PortErrors.MalformedPortSearchError)
          this.scriptError(`Port name was undefined`);
        return possibleFulfilledRequest.portNum;
      }
    } while (true);
  }

  /**
   * Find a port from the portName
   * @param portName The port to search for
   * @returns The portNum that portName is assigned to
   */
  async searchForPort(portName: string): Promise<number> {
    const requestArgs: PortRequest = {
      identifier: this.ns.pid,
      type: RequestTypes.searching,
      portName: portName,
    };
    this.ns.writePort(ReservedPorts.requestPort, JSON.stringify(requestArgs));
    const fulfilledRequestPort = this.ns.getPortHandle(ReservedPorts.fulfilledRequestsPort);

    do {
      // If there is something already, we want to read it immediately
      // If a lot of scripts keep trying to read from this port, that could cause some issues
      // By waiting for this, it should slow them down enough to not worry about it
      await this.ns.sleep(0);
      if (fulfilledRequestPort.empty()) await fulfilledRequestPort.nextWrite();

      const possibleFulfilledRequest: FulfilledPortRequest = this.readObjFromPort<FulfilledPortRequest>(
        ReservedPorts.fulfilledRequestsPort,
      );

      if (possibleFulfilledRequest.scriptID == requestArgs.identifier) {
        // Discard this so no other script tries to read it.
        fulfilledRequestPort.read();
        if (possibleFulfilledRequest.portNum == PortErrors.UndefinedPortNameError)
          throw new Error(
            `Port name is undefined, usually happens when asking for a script's port before the script exists`,
          );
        return possibleFulfilledRequest.portNum;
      }
    } while (true);
  }

  /**
   * Gives up a port for others to use
   * @param portName If defined, the controller will forget this portName
   */
  retirePort(portName: string | null): void {
    const requestArgs: PortRequest = {
      type: RequestTypes.retiring,
      identifier: this.ns.pid,
      portName: portName,
    };
    this.ns.writePort(ReservedPorts.requestPort, JSON.stringify(requestArgs));
  }

  static PORT_CONTROLLER_SCRIPT_PATH = `./daemons/max-ports.js`;
  static PORT_CONTROLLER_FILENAME = `max-ports.js`;
}

// ---PORT-CONTROLLER---
// Would've loved to keep this in the port-controller's file, but to minimize imports its necessary to put here
// ---Errors---
export enum PortErrors {
  DuplicatePortNameError = -1,
  UndefinedPortNameError = -2,
  MalformedPortSearchError = -3,
}

export enum RequestTypes {
  /** @description Asking for a free port */
  requesting,
  /** @description Looking for a port to another script */
  searching,
  /** @description Port is no longer being used */
  retiring,
}

export enum ReservedPorts {
  /** @description Port number where scripts send a request */
  requestPort = 1,
  /** @description Port number where scripts get a port back */
  fulfilledRequestsPort = 2,
}

export interface FulfilledPortRequest {
  readonly scriptID: number;
  readonly portNum: number;
}

export interface PortRequest {
  /** @description Type of the request */
  readonly type: RequestTypes;
  /** @description Identifier for the script, usually the script's pid, but if it is retiring a port, it is the port's number */
  readonly identifier: number;
  readonly portName: string | null;
}
