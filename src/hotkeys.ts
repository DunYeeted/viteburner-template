import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from './libs/ExpandedNS';
import { bestTargetServer, StateBasedHotkeys } from './daemons/adaOS';

export function autocomplete(_data: AutocompleteData, _args: ScriptArg) {
  return [Hotkeys.root, Hotkeys.scan, Hotkeys.target, Hotkeys.temporaryCommand, StateBasedHotkeys.attack];
}

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);

  switch (ns.args[0]) {
    case Hotkeys.root:
      nsx.fullRoot();
      break;
    case Hotkeys.scan:
      ns.tprint(nsx.scanServers());
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
    case StateBasedHotkeys.attack:
      ns.writePort(await nsx.searchForPort(`os`), StateBasedHotkeys.attack);
  }
}

enum Hotkeys {
  root = `root`,
  scan = `scan`,
  temporaryCommand = `temp`,
  target = `bestTarget`,
}
