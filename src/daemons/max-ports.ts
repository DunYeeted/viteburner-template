import { ExpandedNS } from '@/libs/ExpandedNS';
import { ReservedPorts, PortRequest, RequestTypes, PortErrors, FulfilledPortRequest } from '@/libs/port-functions';
import { NS } from '@ns';

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

  const retiredPorts: number[] = [];
  const namedPorts = new Map<string, number>();

  ns.clearPort(ReservedPorts.REQUEST_PORT);
  ns.clearPort(ReservedPorts.FULFILLED_REQUESTS_PORT);

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

  let nextFreePort = ReservedPorts.FULFILLED_REQUESTS_PORT + 1;

  const pcPort = ns.getPortHandle(ReservedPorts.REQUEST_PORT);

  while (true) {
    // If the port has something, read it immediately. If it is empty, wait until something needs our attention
    if (pcPort.empty()) await pcPort.nextWrite();

    const request = nsx.peekObj<PortRequest>(ReservedPorts.REQUEST_PORT);
    ns.readPort(ReservedPorts.REQUEST_PORT);

    switch (request.type) {
      // --- REQUESTING ---
      case RequestTypes.REQUESTING:
        // Somebody already has this portname
        if (request.portName !== null && namedPorts.has(request.portName)) {
          nsx.givePort({ scriptID: request.identifier, portNum: PortErrors.DUPLICATE_NAME_ERROR });
          break;
        }

        // eslint-disable-next-line no-case-declarations
        let port = 0;
        if (retiredPorts.length > 0) {
          port = retiredPorts.shift();
        } else {
          port = nextFreePort;
          nextFreePort++;
        }
        nsx.givePort({ scriptID: request.identifier, portNum: port });
        if (request.portName !== null) namedPorts.set(request.portName, port);
        break;

      // --- SEARCHING ---
      case RequestTypes.SEARCHING:
        // Did not specify a name despite asking for one
        if (request.portName === null) {
          nsx.givePort({ scriptID: request.identifier, portNum: PortErrors.MALFORMED_PORT_SEARCH_ERROR });
          break;
        }
        // eslint-disable-next-line no-case-declarations
        const namedPortNum = namedPorts.get(request.portName);
        // Port has not yet been requested/named
        if (namedPortNum === undefined) {
          nsx.givePort({ scriptID: request.identifier, portNum: PortErrors.UNDEFINED_NAME_ERROR });
          break;
        }
        // Found the correct port
        nsx.givePort({ scriptID: request.identifier, portNum: namedPortNum });
        break;

      // --- RETIRING ---
      case RequestTypes.RETIRING:
        if (request.portName !== null) {
          // Delete the namedPort if necessary
          const deletedNamedPort = namedPorts.delete(request.portName);
          // If this namedPort never existed, it's concerning but given it is about to be retired there's no need to throw an error
          if (!deletedNamedPort) ns.print(`Tried to delete ${request.portName}, but it does not exist!`);
        }
        retiredPorts.push(request.identifier);
        ns.clearPort(request.identifier);
        break;
    }
  }
}

class PortNSX extends ExpandedNS {
  /** @description Sends a port to a script that requested one */
  givePort(data: FulfilledPortRequest): void {
    this.ns.print(`Giving port ${data.portNum} to script ${data.scriptID}`);
    this.ns.writePort(ReservedPorts.FULFILLED_REQUESTS_PORT, JSON.stringify(data));
  }
}
