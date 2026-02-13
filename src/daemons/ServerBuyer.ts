import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';

const PREFIX_FUNCTION = (n: number) => {
  return `scp-${n.toString().padStart(3, `0`)}`;
};

const ATTEMPT_PERIOD = 1000;

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);

  if (ns.args.length == 0 || !Number.isInteger(ns.args[0])) {
    ns.alert(buyInfo(ns));
    return;
  }

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

function buyInfo(ns: NS) {
  let info = ``;
  for (let i = 1; i <= 20; i++) {
    const ram = Math.pow(2, i);
    info += `\n`;
    info += ns.formatRam(ram).padEnd(10, i % 2 == 0 ? `-` : `.`);
    info += `$${ns.formatNumber(ns.getPurchasedServerCost(ram))}`;
  }

  info += `\n\n`;
  info += `Currently owned: ${ns.getPurchasedServers().length}`;

  return info;
}
