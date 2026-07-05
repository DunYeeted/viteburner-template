import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';
import { FilesData } from '@/libs/FilesData';
import { PortHelpers } from '@/libs/Ports';

let nsx: ExpandedNS;

// Starts any daemons not currently running (i.e. max-ports and sleeve-controller)
// Used for aliases which change based on the current state
export async function main(ns: NS) {
  nsx = new ExpandedNS(ns);

  if (ns.args.length != 0)
    nsx.scriptError(
      `Incorrect usage! This script should not be run with args, it is usually started by another script`,
    );
  if (nsx.scriptAlreadyRunning()) nsx.scriptError(`Error! Another version of this script is already running.`);

  const portControllerRunning = ns.ps().findIndex((process) => {
    return process.filename === FilesData['PortController'].filename;
  });

  if (portControllerRunning) {
    ns.run(FilesData['PortController'].path);
    await ns.asleep(100);
  }

  const osPortNumber = await PortHelpers.requestPort(nsx, `os`);
  const osPort = ns.getPortHandle(osPortNumber);

  do {
    if (osPort.empty()) await osPort.nextWrite();

    const request: string = osPort.read() as string;
    switch (request) {
      case StateBasedHotkeys.attack:
        ns.run(FilesData['Batcher'].path, { threads: 1 }, bestTargetServer(nsx));
        break;
    }
  } while (true);
}

/**
 * @returns The best server to attack
 *
 * @remarks RAM Cost: 0.6 GB
 */
export function bestTargetServer(nsx: ExpandedNS): string {
  const hackingLevel = nsx.ns.getHackingLevel();
  let bestScore = -1;
  let bestServer = ``;

  nsx.scanAdminServers().forEach((serverName) => {
    const requiredHackingLevel = nsx.ns.getServerRequiredHackingLevel(serverName);
    const score =
      hackingLevel < requiredHackingLevel
        ? -1
        : hackingLevel < requiredHackingLevel / 2
        ? 0
        : nsx.ns.getServerMaxMoney(serverName) / nsx.ns.getServerMinSecurityLevel(serverName);

    if (score > bestScore) {
      bestScore = score;
      bestServer = serverName;
    }
  });

  return bestServer;
}

export enum StateBasedHotkeys {
  attack = `attack`,
}
