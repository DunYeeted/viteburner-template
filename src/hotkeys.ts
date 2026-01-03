import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from './libs/ExpandedNS';

export function autocomplete(_data: AutocompleteData, _args: ScriptArg) {
  return ['root', 'scan'];
}

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);
  switch (ns.args[0]) {
    case 'root':
      nsx.fullRoot();
      break;
    case 'scan':
      ns.tprint(nsx.fullScan());
      break;
    case 'temp':
      ns.tprint(await nsx.tempFunction('' + ns.args[1]));
      break;
  }
}
