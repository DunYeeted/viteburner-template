import { NS } from '@ns';

const Thresholds = {
  money: 0.75,
  security: 0.1,
};

export async function main(ns: NS) {
  const target: string = <string>ns.args[0];

  const minSecurity = ns.getServerMinSecurityLevel(target);
  const maxMoney = ns.getServerMaxMoney(target);
  while (true) {
    if (ns.getServerSecurityLevel(target) > (1 + Thresholds.security) * minSecurity) {
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < Thresholds.money * maxMoney) {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}
