import { ExpandedNS } from './ExpandedNS';

export class PortHelpers {
  /**
   * Request a port from port-controller
   *
   * Can result in errors, particularly if the controller is not yet running
   * @param portName If defined port-controller will remember this port so other scripts can communicate with this script
   * @returns A free and open port
   */
  static async requestPort(nsx: ExpandedNS, portName: string | null = null): Promise<number> {
    const requestArgs: PortRequest = {
      type: RequestTypes.requesting,
      identifier: nsx.ns.pid,
      portName: portName,
    };
    nsx.ns.writePort(ReservedPorts.REQUEST_PORT, JSON.stringify(requestArgs));
    const fulfilledRequestPort = nsx.ns.getPortHandle(ReservedPorts.FULFILLED_REQUESTS_PORT);

    do {
      // If there is something already, we want to read it immediately
      // If a lot of scripts keep trying to read from this port, that could cause some issues
      // By waiting for this, it should slow them down enough to not worry about it
      await nsx.ns.asleep(0);
      if (fulfilledRequestPort.empty()) await fulfilledRequestPort.nextWrite();

      const possibleFulfilledRequest: FulfilledPortRequest = JSON.parse(
        nsx.ns.peek(ReservedPorts.FULFILLED_REQUESTS_PORT),
      );

      // This is this script's fulfilled port request
      if (possibleFulfilledRequest.scriptID == requestArgs.identifier) {
        // Remove from the queue so other scripts don't try to read this
        fulfilledRequestPort.read();
        // Clear the port before using
        nsx.ns.clearPort(possibleFulfilledRequest.portNum);
        // Throw an error if someone else already had this portName
        if (possibleFulfilledRequest.portNum == PortErrors.DUPLICATE_NAME_ERROR)
          nsx.scriptError(
            `Port name is duplicated, usually happens when running a script twice when only supposed to be run once`,
          );
        if (possibleFulfilledRequest.portNum == PortErrors.MALFORMED_PORT_SEARCH_ERROR)
          nsx.scriptError(`Port name was undefined`);
        return possibleFulfilledRequest.portNum;
      }
    } while (true);
  }

  /**
   * Find a port from the portName
   * @param portName The port to search for
   * @returns The portNum that portName is assigned to
   */
  static async searchForPort(nsx: ExpandedNS, portName: string): Promise<number> {
    const requestArgs: PortRequest = {
      type: RequestTypes.searching,
      identifier: nsx.ns.pid,
      portName: portName,
    };
    nsx.ns.writePort(ReservedPorts.REQUEST_PORT, JSON.stringify(requestArgs));
    const fulfilledRequestPort = nsx.ns.getPortHandle(ReservedPorts.FULFILLED_REQUESTS_PORT);

    do {
      // If there is something already, we want to read it immediately
      // If a lot of scripts keep trying to read from this port, that could cause some issues
      // By waiting for this, it should slow them down enough to not worry about it
      await nsx.ns.asleep(0);
      if (fulfilledRequestPort.empty()) await fulfilledRequestPort.nextWrite();

      const possibleFulfilledRequest: FulfilledPortRequest = JSON.parse(
        nsx.ns.peek(ReservedPorts.FULFILLED_REQUESTS_PORT),
      );

      if (possibleFulfilledRequest.scriptID == requestArgs.identifier) {
        // Discard this so no other script tries to read it.
        fulfilledRequestPort.read();
        if (possibleFulfilledRequest.portNum == PortErrors.UNDEFINED_NAME_ERROR)
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
  static retirePort(nsx: ExpandedNS, portNum: number, portName: string | null = null): void {
    const requestArgs: PortRequest = {
      type: RequestTypes.retiring,
      identifier: portNum,
      portName: portName,
    };
    nsx.ns.writePort(ReservedPorts.REQUEST_PORT, JSON.stringify(requestArgs));
  }
}

// ---PORT-CONTROLLER---
// Would've loved to keep this in the port-controller's file, but to minimize imports its necessary to put here
// ---Errors---
export enum PortErrors {
  DUPLICATE_NAME_ERROR = -1,
  UNDEFINED_NAME_ERROR = -2,
  MALFORMED_PORT_SEARCH_ERROR = -3,
  UNDEFINED_PORT_NUM_ERROR = -4,
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
  REQUEST_PORT = 1,
  /** @description Port number where scripts get a port back */
  FULFILLED_REQUESTS_PORT = 2,
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
