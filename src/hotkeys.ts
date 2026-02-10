import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from './libs/ExpandedNS';
import { bestTargetServer, StateBasedHotkeys } from './daemons/adaOS';
import { PortHelpers } from './libs/Ports';
import { SpecialServers } from './libs/Constants';

export function autocomplete(data: AutocompleteData, args: ScriptArg[]) {
  if (args.length >= 1) {
    return [
      Hotkeys.root,
      Hotkeys.scan,
      Hotkeys.target,
      Hotkeys.temporaryCommand,
      Hotkeys.analyze,
      StateBasedHotkeys.attack,
      ...data.servers,
    ];
  }
  return [
    Hotkeys.root,
    Hotkeys.scan,
    Hotkeys.target,
    Hotkeys.temporaryCommand,
    Hotkeys.analyze,
    StateBasedHotkeys.attack,
  ];
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
${server.padEnd(20)}|${ns.hasRootAccess(server) ? ` * ` : `   `}|${SpecialServers.includes(server) ? ` @ ` : `   `}`;
      });

      ns.tprint(output);
      break;
    case Hotkeys.temporaryCommand:
      ns.tprint(await nsx.tempFunction('' + ns.args[1]));
      break;
    case Hotkeys.target:
      ns.tprint(bestTargetServer(nsx));
      ns.tprint(
        `Using adaOS to attack automatically does this, so only use this if you do not have enough ram for that`,
      );
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
  Level: ${server.hackDifficulty}
  Money: $${ns.formatNumber(server.moneyAvailable ?? 0)} / $${ns.formatNumber(server.moneyMax ?? 0)}
  Security: ${server.hackDifficulty} / ${server.minDifficulty}
`);
      break;
    case StateBasedHotkeys.attack:
      ns.writePort(await PortHelpers.searchForPort(nsx, `os`), StateBasedHotkeys.attack);
      break;
  }
}

enum Hotkeys {
  root = `root`,
  scan = `scan`,
  temporaryCommand = `temp`,
  target = `bestTarget`,
  analyze = `analyze`,
}
