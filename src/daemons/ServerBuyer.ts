import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';

const PREFIX_FUNCTION = (n: number) => {
  return `scp-${n.toString().padStart(3, `0`)}`;
};

const ATTEMPT_PERIOD = 1000;

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);

  if (typeof ns.args[0] !== `number` || !Number.isInteger(Math.log2(ns.args[0]))) {
    ns.tprint(`Incorrect usage!:
  ./daemons/ServerBuyer <number>
  ./daemons/ServerBuyer 16`);
    ns.exit();
  }
  if (nsx.scriptAlreadyRunning()) {
    nsx.scriptError(`Error! Another version of this script is already running.`);
  }

  const wishRam: number = ns.args[0];

  const maxServers = ns.getPurchasedServerLimit();
  const boughtServers = ns.getPurchasedServers();
  const purchaseCost = ns.getPurchasedServerCost(wishRam);

  for (let i = 0; i < maxServers; i++) {
    if (i < boughtServers.length) {
      if (ns.getServerMaxRam(boughtServers[i]) >= wishRam) continue;
      while (!ns.upgradePurchasedServer(boughtServers[i], wishRam)) {
        await ns.asleep(ATTEMPT_PERIOD);
      }
    } else {
      while (ns.getServerMoneyAvailable(`home`) < purchaseCost) {
        await ns.asleep(ATTEMPT_PERIOD);
      }

      const name = PREFIX_FUNCTION(i);
      ns.purchaseServer(name, wishRam);
    }
  }

  ns.toast(`Finished buying ${maxServers} servers with ${ns.formatRam(wishRam)} each`);
}
