import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from './libs/ExpandedNS';
import { bestTargetServer, StateBasedHotkeys } from './daemons/adaOS';
import { PortHelpers } from './libs/Ports';
import { PossibleRamAmts, SpecialServers } from './libs/Constants';

export function autocomplete(data: AutocompleteData, args: ScriptArg[]) {
  const baseArgs = [
    Hotkeys.root,
    Hotkeys.scan,
    Hotkeys.target,
    Hotkeys.temporaryCommand,
    Hotkeys.analyze,
    Hotkeys.cnct,
    Hotkeys.buyer,
    StateBasedHotkeys.attack,
  ];

  if (args.length >= 2) {
    return [...PossibleRamAmts, ...data.servers];
  }
  if (args.length >= 1) {
    return [...baseArgs, ...PossibleRamAmts, ...data.servers];
  }
  return [...baseArgs];
}

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);

  switch (ns.args[0]) {
    case Hotkeys.root:
      nsx.fullRoot();
      break;
    case Hotkeys.scan:
      ns.tprint(prettyScan(nsx));
      break;
    case Hotkeys.temporaryCommand:
      ns.tprint(await nsx.tempFunction(<string>ns.args[1]));
      break;
    case Hotkeys.target:
      findAndAttack(nsx);
      break;
    case Hotkeys.analyze:
      if (typeof ns.args[1] !== `string`) ns.exit();
      ns.tprint(analyzeServer(ns, ns.args[1]));
      break;
    case Hotkeys.buyer:
      ns.run(`./daemons/ServerBuyer.js`, { threads: 1 }, ns.args[1] ?? ``);
      break;
    case Hotkeys.cnct:
      if (typeof ns.args[1] !== `string`) ns.exit();
      ns.tprint(createConnectCommand(getServerOrder(ns, ns.args[1])));
      break;
    case StateBasedHotkeys.attack:
      ns.writePort(await PortHelpers.searchForPort(nsx, `os`), StateBasedHotkeys.attack);
      break;
  }
}

function prettyScan(nsx: ExpandedNS) {
  let output = '';
  nsx.scanServers().forEach((server) => {
    output += `\n`;
    output += `${server.padEnd(20)}|${nsx.ns.hasRootAccess(server) ? ` * ` : `   `}|`;
    const isSpecialServer = SpecialServers.includes(server);
    const canHack = nsx.ns.getServerRequiredHackingLevel(server) <= nsx.ns.getHackingLevel();
    output += `${!canHack ? `   ` : isSpecialServer ? ` @ ` : ` ~ `}`;
  });

  return output;
}

function findAndAttack(nsx: ExpandedNS) {
  const bestTarget = bestTargetServer(nsx);
  nsx.ns.tprint(bestTarget);
  const prepPid = nsx.ns.run(`./batch-makers/server-prepper.js`, { threads: 1 }, bestTarget);
  nsx.ns.tprint(`tail ${prepPid}`);
}

/** Returns a report on the server */
function analyzeServer(ns: NS, server: string) {
  const serv = ns.getServer(server);
  const output = `
Name: ${ns.args[1]}
Root access: ${serv.hasAdminRights ? `YES` : `NO`}
RAM: ${ns.formatRam(serv.ramUsed)} Used / ${ns.formatRam(serv.maxRam)} total
Bought: ${serv.purchasedByPlayer ? `YES` : `NO`}
Hacking info:
  Level: ${serv.requiredHackingSkill}
  Money: $${ns.formatNumber(serv.moneyAvailable ?? 0)} / $${ns.formatNumber(serv.moneyMax ?? 0)}
  Security: ${ns.formatNumber(serv.hackDifficulty ?? 0)} / ${ns.formatNumber(serv.minDifficulty ?? 0)}
`;
  return output;
}

/** Finds the servers to connect to in order to get to a specified server */
function getServerOrder(ns: NS, destination: string) {
  const tree = serversTree(ns);
  let recentServer: string = destination;
  const order = [recentServer];
  while (recentServer !== `home`) {
    recentServer = tree.get(recentServer) ?? ``;
    order.unshift(recentServer);
  }

  return order;
}

/** Returns a string for the set of connects to get to a server */
function createConnectCommand(servers: string[]): string {
  let runStr = `home;`;
  for (const server of servers) {
    runStr += `connect ${server};`;
  }

  return runStr;
}

function serversTree(ns: NS): Map<string, string> {
  const servers: string[] = [`home`];
  const serverTree: Map<string, string> = new Map();
  serverTree.set(`home`, `done`);

  for (let i = 0; i < servers.length; i++) {
    const nextServers = ns.scan(servers[i]);

    nextServers.forEach((server) => {
      if (servers.includes(server)) return;

      servers.push(server);
      serverTree.set(server, servers[i]);
    });
  }

  return serverTree;
}

enum Hotkeys {
  root = `root`,
  scan = `scan`,
  temporaryCommand = `temp`,
  target = `bestTarget`,
  analyze = `analyze`,
  buyer = `buyer`,
  cnct = `shortestPath`,
}
