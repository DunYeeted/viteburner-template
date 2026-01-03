import { isPrepped, RamNet } from '@/libs/controller-functions';
import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';

let nsx: ExpandedNS;
let SERVER_NAME: string;

export async function main(ns: NS) {
  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
      ./batch-makers/server-prepper.js <server>
      ./batch-makers/server-prepper.js foodnstuff`);
    return;
  }

  SERVER_NAME = ns.args[0];
  nsx = new ExpandedNS(ns);

  while (!isPrepped(ns, SERVER_NAME)) {
    const network = new RamNet(nsx);
  }
}

function createBatch(network: RamNet) {
  const idealGrowThreads = 
}