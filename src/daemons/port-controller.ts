import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';

// ---ERRORS---
const DuplicatePortNameError = -1;
const UndefinedPortNameError = -2;

// ---RESERVED PORTS---
const REQUEST_PORTS_PORT_NUMBER = 1;
const FULFILLED_REQUESTS_PORT_NUMBER = 2;

const retiredPorts: number[] = [];
const namedPorts = new Map<string, number>();
let nsx: ExpandedNS;

export async function main(ns: NS) {
  nsx = new ExpandedNS(ns);

  let nextFreePort = FULFILLED_REQUESTS_PORT_NUMBER + 1;

  const PORT_CONTROLLER_PORT = ns.getPortHandle(REQUEST_PORTS_PORT_NUMBER);

  while (true) {
    await PORT_CONTROLLER_PORT.nextWrite();

    while (!PORT_CONTROLLER_PORT.empty()) {
      const request = nsx.readObjFromPort<PortRequest>(REQUEST_PORTS_PORT_NUMBER);

      // Asking for a named port's number
      if (request.requestingNamedPort) {
        givePort(ns, {
          scriptID: request.scriptID,
          port: namedPorts.get(request.portName ?? '') ?? UndefinedPortNameError,
        });
        break;
      }

      // A port with this name already exists, return error
      const isNamed = request.portName !== undefined;
      if (isNamed && namedPorts.has(request.portName)) {
        givePort(ns, { scriptID: request.scriptID, port: DuplicatePortNameError });
        break;
      }

      let portToGive: number;

      if (retiredPorts.length != -1) {
        portToGive = retiredPorts.shift();
      } else {
        portToGive = nextFreePort;
        nextFreePort++;
      }

      givePort(ns, { scriptID: request.scriptID, port: portToGive });
      // Remember the port if its named
      if (isNamed) namedPorts.set(request.portName, portToGive);
    }
  }
}

/**
 * @param ns
 * @param portName If defined, port-controller will remember this so other scripts can ask for it
 * @returns A free port
 */
export async function requestPort(nsx: ExpandedNS, portName?: string): Promise<number> {
  const requestArgs: PortRequest = { scriptID: nsx.ns.pid, portName: portName, requestingNamedPort: false };
  nsx.ns.writePort(REQUEST_PORTS_PORT_NUMBER, JSON.stringify(requestArgs));

  do {
    await nsx.ns.nextPortWrite(FULFILLED_REQUESTS_PORT_NUMBER);

    const possibleFulfilledRequest: FulfilledPortRequest =
      nsx.readObjFromPort<FulfilledPortRequest>(FULFILLED_REQUESTS_PORT_NUMBER);

    if (possibleFulfilledRequest.scriptID == requestArgs.scriptID) {
      nsx.ns.readPort(FULFILLED_REQUESTS_PORT_NUMBER);
      nsx.ns.clearPort(possibleFulfilledRequest.port);
      if (possibleFulfilledRequest.port == DuplicatePortNameError)
        throw new Error(
          `Port name is duplicated, usually happens when running a script twice when only supposed to be run once`,
        );
      return possibleFulfilledRequest.port;
    }
  } while (true);
}

export async function askForPort(nsx: ExpandedNS, portName: string): Promise<number> {
  const requestArgs: PortRequest = { scriptID: nsx.ns.pid, portName: portName, requestingNamedPort: true };

  do {
    await nsx.ns.nextPortWrite(FULFILLED_REQUESTS_PORT_NUMBER);

    const possibleFulfilledRequest: FulfilledPortRequest =
      nsx.readObjFromPort<FulfilledPortRequest>(FULFILLED_REQUESTS_PORT_NUMBER);

    if (possibleFulfilledRequest.scriptID == requestArgs.scriptID) {
      nsx.ns.readPort(FULFILLED_REQUESTS_PORT_NUMBER);
      nsx.ns.clearPort(possibleFulfilledRequest.port);
      if (possibleFulfilledRequest.port == UndefinedPortNameError)
        throw new Error(
          `Port name is undefined, usually happens when asking for a script's port before the script exists`,
        );
      return possibleFulfilledRequest.port;
    }
  } while (true);
}

export function retirePort(ns: NS, port: number, portName?: string) {
  if (portName !== undefined) namedPorts.delete(portName);

  ns.clearPort(port);
  retiredPorts.push(port);
}

function givePort(ns: NS, data: FulfilledPortRequest): void {
  ns.writePort(FULFILLED_REQUESTS_PORT_NUMBER, JSON.stringify(data));
}

interface FulfilledPortRequest {
  readonly scriptID: number;
  readonly port: number;
}

interface PortRequest {
  readonly requestingNamedPort: boolean;
  readonly scriptID: number;
  readonly portName?: string;
}
