import { Hacknet, NS } from '@ns';

const SleepTime = 100;

const multiPerLevel = 1.5;
let bitnodeHacknetMulti = 1;
let baseProduction = 1;
const Maxes = {
  Level: 200,
  Ram: 64,
  Cores: 16,
};

export async function main(ns: NS) {
  baseProduction = ns.getHacknetMultipliers().production;
  bitnodeHacknetMulti = 1;
  const hn = ns.hacknet;
  while (true) {
    const bestUpgrade = findBestUpgrade(hn);
    switch (bestUpgrade.type) {
      case UpgradeType.NewNode:
        ns.print('Trying to buy');
        hn.purchaseNode();
        break;
      case UpgradeType.Core:
        ns.print('Trying to upgrade cores on ' + bestUpgrade.index);
        hn.upgradeCore(bestUpgrade.index);
        break;
      case UpgradeType.Level:
        ns.print('Trying to upgrade level on ' + bestUpgrade.index);
        hn.upgradeLevel(bestUpgrade.index);
        break;
      case UpgradeType.Ram:
        ns.print('Trying to upgrade ram on ' + bestUpgrade.index);
        hn.upgradeRam(bestUpgrade.index);
        break;
    }
    await ns.asleep(SleepTime);
  }
}

function findBestUpgrade(hn: Hacknet): { type: UpgradeType; increasePerCost: number; index: number } {
  const numNodes = hn.numNodes();
  let bestOption = {
    type: UpgradeType.NewNode,
    increasePerCost: getProduction(1, 1, 1) / hn.getPurchaseNodeCost(),
    index: -1,
  };
  for (let i = 0; i < numNodes; i++) {
    const node = hn.getNodeStats(i);

    const coreIncrease = getProduction(node.cores + 1, node.level, node.ram) - node.production;
    const coreCost = hn.getCoreUpgradeCost(i);

    const levelIncrease = getProduction(node.cores, node.level + 1, node.ram) - node.production;
    const levelCost = hn.getLevelUpgradeCost(i);

    // Ram always doubles
    const ramIncrease = getProduction(node.cores, node.level, node.ram * 2) - node.production;
    const ramCost = hn.getRamUpgradeCost(i);

    const coreIncreasePerCost = coreIncrease / coreCost;
    const levelIncreasePerCost = levelIncrease / levelCost;
    const ramIncreasePerCost = ramIncrease / ramCost;

    const best = Math.max(coreIncreasePerCost, levelIncreasePerCost, ramIncreasePerCost);
    if (bestOption.increasePerCost > best && (bestOption.type != UpgradeType.NewNode || numNodes != hn.maxNumNodes())) {
      continue;
    }
    if (best == coreIncreasePerCost) {
      bestOption = { type: UpgradeType.Core, increasePerCost: coreIncreasePerCost, index: i };
    } else if (best == levelIncreasePerCost) {
      bestOption = { type: UpgradeType.Level, increasePerCost: levelIncreasePerCost, index: i };
    } else if (best == ramIncreasePerCost) {
      bestOption = { type: UpgradeType.Ram, increasePerCost: ramIncreasePerCost, index: i };
    }
  }
  return bestOption;
}

/** Calculates the production of a node with the given parameters */
function getProduction(cores: number, level: number, ram: number) {
  if (cores > Maxes.Cores) cores = Maxes.Cores;
  if (level > Maxes.Level) level = Maxes.Level;
  if (ram > Maxes.Ram) ram = Maxes.Ram;

  const levelMulti = level * multiPerLevel;
  const ramMulti = Math.pow(1.035, ram - 1);
  const coresMulti = (cores + 5) / 6;

  return coresMulti * levelMulti * ramMulti * bitnodeHacknetMulti * baseProduction;
}

enum UpgradeType {
  NewNode,
  Core,
  Level,
  Ram,
}
