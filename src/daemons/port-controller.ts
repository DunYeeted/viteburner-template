import { NS } from '@ns';

const REQUEST_PORTS_PORT = 1;
const FULFILLED_PORT_REQUESTS_PORT = 2;
const retiredPorts: number[] = [];

export async function main(ns: NS) {
  let nextFreePort = FULFILLED_PORT_REQUESTS_PORT + 1;

  const PORT_CONTROLLER_PORT = ns.getPortHandle(REQUEST_PORTS_PORT);
  while (true) {
    await PORT_CONTROLLER_PORT.nextWrite();
    while (!PORT_CONTROLLER_PORT.empty()) {
      const requestID = ns.readPort(REQUEST_PORTS_PORT);
      if (retiredPorts.length > 0) {
        givePort(ns, { scriptID: requestID, port: retiredPorts.shift() });
      } else {
        givePort(ns, { scriptID: requestID, port: nextFreePort });
        nextFreePort++;
      }
    }
  }
}

export async function requestPort(ns: NS): Promise<number> {
  const scriptID = ns.pid;
  ns.writePort(REQUEST_PORTS_PORT, scriptID);
  do {
    await ns.nextPortWrite(FULFILLED_PORT_REQUESTS_PORT);
    const possibleFulfilledRequest: FulfilledPortRequest = JSON.parse(ns.peek(FULFILLED_PORT_REQUESTS_PORT));
    if (possibleFulfilledRequest.scriptID == scriptID) {
      ns.readPort(FULFILLED_PORT_REQUESTS_PORT);
      ns.clearPort(possibleFulfilledRequest.port);
      return possibleFulfilledRequest.port;
    }
  } while (true);
}

export function retirePort(ns: NS, port: number) {
  ns.clearPort(port);
  retiredPorts.push(port);
}

function givePort(ns: NS, data: FulfilledPortRequest): void {
  ns.writePort(FULFILLED_PORT_REQUESTS_PORT, JSON.stringify(data));
}

export interface FulfilledPortRequest {
  readonly scriptID: number;
  readonly port: number;
}
