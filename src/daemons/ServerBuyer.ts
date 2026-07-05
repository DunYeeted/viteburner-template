import { ExpandedNS } from '@/libs/ExpandedNS';
import { NS } from '@ns';

const PREFIX_FUNCTION = (n: number) => {
  return `scp-${n.toString().padStart(3, `0`)}`;
};

const ATTEMPT_PERIOD = 1000;

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);
  const c = ns.cloud;

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

  const maxServers = c.getServerLimit();
  const boughtServers = c.getServerNames();
  const purchaseCost = c.getServerCost(wishRam);

  for (let i = 0; i < maxServers; i++) {
    // Looking only at servers we've already bought
    if (i < boughtServers.length) {
      // If the server we're looking at has the same or more ram than we're buying, leave it alone
      if (ns.getServerMaxRam(boughtServers[i]) >= wishRam) continue;
      // If the server we're looking at has less ram, wait until we have more than enough
      while (c.getServerUpgradeCost(boughtServers[i], wishRam) > ns.getServerMoneyAvailable(`home`)) {
        await ns.asleep(ATTEMPT_PERIOD);
      }
      c.upgradeServer(boughtServers[i], wishRam);
    } else {
      // Purchasing new servers
      while (ns.getServerMoneyAvailable(`home`) < purchaseCost) {
        await ns.asleep(ATTEMPT_PERIOD);
      }

      const name = PREFIX_FUNCTION(i);
      c.purchaseServer(name, wishRam);
    }
  }

  ns.toast(`Finished buying ${maxServers} servers with ${ns.format.ram(wishRam)} each`);
}

function buyInfo(ns: NS) {
  let info = ``;
  for (let i = 1; i <= 20; i++) {
    const ram = Math.pow(2, i);
    info += `\n`;
    info += ns.format.ram(ram).padEnd(10, i % 2 == 0 ? `-` : `.`);
    info += `$${ns.format.number(ns.cloud.getServerCost(ram))}`;
  }

  info += `\n\n`;
  info += `Currently owned: ${ns.cloud.getServerNames().length}`;

  return info;
}
