import { Hacknet, NodeStats, NS } from "@ns";

const multiPerLevel = 1.5;
const bitnodeHacknetMulti = 1;
const Maxes = {
  Level: 200,
  Ram: 64,
  Cores: 16,
};

export async function main(ns: NS) {
  const hn = ns.hacknet;
  while (true) {
    await ns.asleep(10000);
    const bestUpgrade = findBestUpgrade(hn);
    switch (bestUpgrade.type) {
      case UpgradeType.NewNode:
        hn.purchaseNode();
        break;
      case UpgradeType.Core:
        hn.upgradeCore(bestUpgrade.index);
        break;
      case UpgradeType.Level:
        hn.upgradeLevel(bestUpgrade.index);
        break;
      case UpgradeType.Ram:
        hn.upgradeRam(bestUpgrade.index);
        break;
    }
  }
}

function findBestUpgrade(hn: Hacknet): { type: UpgradeType; increasePerCost: number; index: number } {
  let bestOption = { type: UpgradeType.NewNode, increasePerCost: getProduction(1, 1, 1), index: -1 };
  for (let i = 0; i < hn.numNodes(); i++) {
    const node = hn.getNodeStats(i);
    const nodeProd = getProductionFromNode(node);

    const coreIncrease = getProduction(node.cores + 1, node.level, node.ram) - nodeProd;
    const coreCost = hn.getCoreUpgradeCost(i);

    const levelIncrease = getProduction(node.cores, node.level + 1, node.ram) - nodeProd;
    const levelCost = hn.getLevelUpgradeCost(i);
    // Ram always doubles
    const ramIncrease = getProduction(node.cores, node.level, node.ram * 2) - nodeProd;
    const ramCost = hn.getRamUpgradeCost(i);

    const coreIncreasePerCost = coreIncrease / coreCost;
    const levelIncreasePerCost = levelIncrease / levelCost;
    const ramIncreasePerCost = ramIncrease / ramCost;

    const best = Math.max(coreIncreasePerCost, levelIncreasePerCost, ramIncreasePerCost, bestOption.increasePerCost);
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


/** Calculates a node's production */
function getProductionFromNode(node: NodeStats) {
  return getProduction(node.cores, node.level, node.ram);
}

/** Calculates the production of a node with the given parameters */
function getProduction(cores: number, level: number, ram: number) {
  if (cores > Maxes.Cores) cores = Maxes.Cores;
  if (level > Maxes.Level) level = Maxes.Level;
  if (ram > Maxes.Ram) ram = Maxes.Ram;

  const coresMulti = (cores + 5) / 6;
  const levelMulti = level * multiPerLevel;
  const ramMulti = Math.pow(1.035, ram - 1);

  return coresMulti * levelMulti * ramMulti * bitnodeHacknetMulti;
}

enum UpgradeType {
  NewNode,
  Core,
  Level,
  Ram,
}
