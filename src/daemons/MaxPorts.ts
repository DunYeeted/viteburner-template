import { ExpandedNS } from '@/libs/ExpandedNS';
import { ReservedPorts, PortRequest, RequestTypes, PortErrors, FulfilledPortRequest } from '@/libs/Ports';
import { NetscriptPort, NS } from '@ns';

export async function main(ns: NS) {
  const nsx = new PortNSX(ns);

  if (ns.args.length != 0)
    nsx.scriptError(
      `Incorrect usage! This script should not be run with args, it is usually started by another script`,
    );
  if (nsx.scriptAlreadyRunning()) nsx.scriptError(`Error! Another version of this script is already running.`);

  // Most scripts depend on this script. If this crashes, kill all scripts
  nsx.ns.atExit(() => {
    nsx.ns.alert(`SHIP IS GOING DOWN, ALL HELL BREAK LOOSE
max-ports.js`);
    nsx.clearServers(true);
  });

  // Print the logo
  nsx.ns.tprint(`
 _____ ______   ________     ___    ___             ________  ________  ________  _________  ________      
|\\   _ \\  _   \\|\\   __  \\   |\\  \\  /  /|           |\\   __  \\|\\   __  \\|\\   __  \\|\\___   ___|\\   ____\\     
\\ \\  \\\\\\__\\ \\  \\ \\  \\|\\  \\  \\ \\  \\/  / ____________\\ \\  \\|\\  \\ \\  \\|\\  \\ \\  \\|\\  \\|___ \\  \\_\\ \\  \\___|_    
 \\ \\  \\\\|__| \\  \\ \\   __  \\  \\ \\    / |\\____________\\ \\   ____\\ \\  \\\\\\  \\ \\   _  _\\   \\ \\  \\ \\ \\_____  \\   
  \\ \\  \\    \\ \\  \\ \\  \\ \\  \\  /     \\/\\|____________|\\ \\  \\___|\\ \\  \\\\\\  \\ \\  \\\\  \\|   \\ \\  \\ \\|____|\\  \\  
   \\ \\__\\    \\ \\__\\ \\__\\ \\__\\/  /\\   \\                \\ \\__\\    \\ \\_______\\ \\__\\\\ _\\    \\ \\__\\  ____\\_\\  \\ 
    \\|__|     \\|__|\\|__|\\|__/__/ /\\ __\\                \\|__|     \\|_______|\\|__|\\|__|    \\|__| |\\_________\\
                            |__|/ \\|__|                                                        \\|_________|
Weaving scripts to their destination™`);

  const requestPort = ns.getPortHandle(ReservedPorts.REQUEST_PORT);

  while (true) {
    // If the port has something, read it immediately. If it is empty, wait until something needs our attention
    if (requestPort.empty()) await requestPort.nextWrite();
    const request: PortRequest = JSON.parse(requestPort.read());

    switch (request.type) {
      case RequestTypes.requesting:
        nsx.handlePortRequest(request);
        break;
      case RequestTypes.searching:
        nsx.handlePortSearch(request);
        break;
      case RequestTypes.retiring:
        nsx.handlePortRetire(request);
        break;
    }
  }
}

class PortNSX extends ExpandedNS {
  retiredPorts: number[] = [];
  namedPorts = new Map<string, number>();
  private requestPort: NetscriptPort;
  private fulfillPort: NetscriptPort;
  private nextFreePort = ReservedPorts.FULFILLED_REQUESTS_PORT + 1;

  constructor(nsContext: NS) {
    super(nsContext);

    this.requestPort = this.ns.getPortHandle(ReservedPorts.REQUEST_PORT);
    this.requestPort.clear();
    this.fulfillPort = this.ns.getPortHandle(ReservedPorts.FULFILLED_REQUESTS_PORT);
    this.fulfillPort.clear();
  }

  /** @description Sends a port to a script that requested one */
  private givePort(data: FulfilledPortRequest): void {
    this.ns.print(`Giving port ${data.portNum} to script ${data.scriptID}`);
    this.ns.writePort(ReservedPorts.FULFILLED_REQUESTS_PORT, JSON.stringify(data));
  }

  public handlePortRetire(request: PortRequest) {
    // Delete the namedPort if necessary
    if (request.portName !== null && !this.namedPorts.delete(request.portName)) {
      // If this namedPort never existed, it's concerning but since it is about to be retired there's no need to throw an error
      this.ns.toast(`Tried to delete ${request.portName}, but it does not exist!`, `warning`);
    }
    this.retiredPorts.push(request.identifier);
    this.ns.clearPort(request.identifier);
  }

  public handlePortSearch(request: PortRequest) {
    // Did not specify a name despite asking for one
    if (request.portName === null) {
      this.givePort({ scriptID: request.identifier, portNum: PortErrors.MALFORMED_PORT_SEARCH_ERROR });
      return;
    }
    const namedPortNum = this.namedPorts.get(request.portName);
    // Port has not yet been requested/named
    if (namedPortNum === undefined) {
      this.givePort({ scriptID: request.identifier, portNum: PortErrors.UNDEFINED_NAME_ERROR });
      return;
    }
    // Found the correct port
    this.givePort({ scriptID: request.identifier, portNum: namedPortNum });
  }

  public handlePortRequest(request: PortRequest) {
    // Somebody already has this portname
    if (request.portName !== null && this.namedPorts.has(request.portName)) {
      this.givePort({ scriptID: request.identifier, portNum: PortErrors.DUPLICATE_NAME_ERROR });
      return;
    }

    let port = this.nextFreePort;
    if (this.retiredPorts.length > 0) {
      port = <number>this.retiredPorts.shift();
    } else {
      this.nextFreePort++;
    }
    this.givePort({ scriptID: request.identifier, portNum: port });
    if (request.portName !== null) this.namedPorts.set(request.portName, port);
  }

  public get nextPort(): number {
    return this.nextFreePort;
  }
}
