/* eslint-disable no-case-declarations */
import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from './libs/ExpandedNS';
import { bestTargetServer, StateBasedHotkeys } from './daemons/adaOS';
import { PortHelpers } from './libs/Ports';
import { PossibleRamAmts, SpecialServers } from './libs/Constants';
import { FilesData } from './libs/FilesData';

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
      // eslint-disable-next-line no-case-declarations
      let output = '';
      nsx.scanServers().forEach((server) => {
        output += `
${server.padEnd(20)}|${ns.hasRootAccess(server) ? ` * ` : `   `}|${SpecialServers.includes(server) && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel() ? ` @ ` : `   `}`;
      });

      ns.tprint(output);
      break;
    case Hotkeys.temporaryCommand:
      ns.tprint(await nsx.tempFunction(<string>ns.args[1]));
      break;
    case Hotkeys.target:
      const bestTarget = bestTargetServer(nsx);
      ns.tprint(bestTarget);
      const prepPid = ns.run(FilesData['ServerPreparer'].path, { threads: 1 }, bestTarget);
      ns.tprint(`tail ${prepPid}`);
      break;
    case Hotkeys.analyze:
      if (typeof ns.args[1] !== `string`) ns.exit();
      // eslint-disable-next-line no-case-declarations
      const server = ns.getServer(ns.args[1]);
      ns.tprint(`

Name: ${ns.args[1]}
Root access: ${server.hasAdminRights ? `YES` : `NO`}
RAM: ${ns.formatRam(server.ramUsed)} Used / ${ns.formatRam(server.maxRam)} total
Bought: ${server.purchasedByPlayer ? `YES` : `NO`}
Hacking info:
  Level: ${server.requiredHackingSkill}
  Money: $${ns.formatNumber(server.moneyAvailable ?? 0)} / $${ns.formatNumber(server.moneyMax ?? 0)}
  Security: ${ns.formatNumber(server.hackDifficulty ?? 0)} / ${ns.formatNumber(server.minDifficulty ?? 0)}
`);
      break;
    case Hotkeys.buyer:
      ns.run(FilesData['ServerBuyer'].path, { threads: 1 }, ns.args[1]);
      break;
    case Hotkeys.cnct:
      const tree = serversTree(ns);
      let recentServer: string = <string>ns.args[1];
      const order = [recentServer];
      while (recentServer !== `home`) {
        recentServer = tree.get(recentServer) ?? ``;
        order.unshift(recentServer);
      }
      let runStr = `home;`;
      for (const server of order) {
        runStr += `connect ${server};`;
      }
      ns.tprint(runStr);
      break;
    case StateBasedHotkeys.attack:
      ns.writePort(await PortHelpers.searchForPort(nsx, `os`), StateBasedHotkeys.attack);
      break;
  }
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
