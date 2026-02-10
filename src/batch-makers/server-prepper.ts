import { AutocompleteData, NS, ScriptArg } from '@ns';
import { ExpandedNS } from '@/libs/ExpandedNS';
import { FilesData } from '@/libs/FilesData';
import { PortHelpers } from '@/libs/Ports';
import { calcGrowthFromThreads } from '@/libs/utils';
import { JobHelpers, gwBatch, wBatch, Batcher } from '@/libs/controller-functions/Batcher';
import { JobTypes, Timing } from '@/libs/controller-functions/Enums';
import { RamNet } from '@/libs/controller-functions/RamNet';

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);
  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
      ./batch-makers/server-prepper.js <server>
      ./batch-makers/server-prepper.js foodnstuff`);
    return;
  }
  ns.disableLog(`ALL`);
  ns.enableLog(`print`);

  const targetName: string = ns.args[0];

  // Send HGW scripts to the servers
  nsx.scanAdminServers().forEach((server) => {
    ns.scp([JobHelpers.Paths.grow, JobHelpers.Paths.weaken, JobHelpers.Paths.hack], server, `home`);
  });

  const pBatcher = new PreparerBatcher(nsx, new RamNet(nsx), targetName);

  const portNum = await PortHelpers.requestPort(nsx);
  pBatcher.port = portNum;
  const hackLvl = ns.getHackingLevel();

  // ---Logging function---
  let endTime = 0;
  let prospectedMoney = 0;
  let batches: (gwBatch | wBatch)[] = [];
  const logger = setInterval(() => {
    prospectedMoney = pBatcher.batchGrowth(batches);
    const currentMoney = Math.max(ns.getServerMoneyAvailable(targetName), 1);
    ns.clearLog();
    ns.print(`Prepping ${targetName}`);
    ns.print(`Empty ram: ${ns.formatRam(pBatcher.totalRam)}`);
    ns.print(`-- Prep Info --
  To: $${ns.formatNumber(prospectedMoney)}
  Change: $${ns.formatNumber(prospectedMoney - currentMoney, 1)} (${ns.formatPercent(prospectedMoney / currentMoney)})`);
    ns.print(`Active workers: ${pBatcher.runningScripts.length}`);
    ns.print(`ETA: ${ns.tFormat(endTime - performance.now())}`);
  }, 1000);

  // Remember to clear the timer and retire the port eventually
  ns.atExit(() => {
    PortHelpers.retirePort(nsx, portNum);
    clearInterval(logger);
  });
  const port = ns.getPortHandle(portNum);

  while (!pBatcher.isPrepped()) {
    batches = pBatcher.createBatchesList();
    // Run each batch
    for (let i = 0; i < batches.length; i++) {
      pBatcher.runningScripts.push(...(await pBatcher.deployBatch(batches[i], i)));
    }
    await ns.asleep(Timing.buffer);
    // Need to give the start signal to the queued workers
    endTime = performance.now() + pBatcher.weakenTime + 10;
    await pBatcher.sendStartSignal(endTime);

    // Wait for the scripts to finish
    do {
      // ns.tprint(`Waiting...`);
      await port.nextWrite();
      if (!port.empty()) pBatcher.runningScripts.splice(pBatcher.runningScripts.indexOf(port.read()), 1);
    } while (pBatcher.runningScripts.length > 0);

    // Finished this run through
    // Check if we levelled up
    // If we did, restart the script
    if (ns.getHackingLevel() !== hackLvl) {
      ns.spawn(FilesData['ServerPreparer'].path, { spawnDelay: 0 }, ...ns.args);
    }
    // Otherwise, loop around again
  }

  ns.toast(`${targetName} is now prepped!`, `success`);
}

class PreparerBatcher extends Batcher {
  runningScripts: number[] = [];
  readonly serverMinSec: number;
  /** The amount of money currently on the server */
  readonly serverMoney: number;
  /** The server's growth parameter */
  readonly serverGrowth: number;

  constructor(nsx: ExpandedNS, network: RamNet, targetName: string) {
    super(nsx, network, targetName);
    this.serverMinSec = nsx.ns.getServerMinSecurityLevel(targetName);
    this.serverMoney = nsx.ns.getServerMoneyAvailable(targetName);
    this.serverGrowth = nsx.ns.getServerGrowth(targetName);
  }

  public createBatchesList(): (gwBatch | wBatch)[] {
    const serverCurrSec = this.nsx.ns.getServerSecurityLevel(this.targetName);
    const batches: (gwBatch | wBatch)[] = [];

    if (serverCurrSec > this.serverMinSec) {
      batches.push(...this.weakenServerBatches(serverCurrSec));
    }

    batches.push(...this.growServerBatches(this.serverMoney));
    return batches;
  }

  private weakenServerBatches(currSec: number, batches: wBatch[] = []): wBatch[] {
    const largestServer = this.network.largestServer;
    // First check if we can even run a weaken thread, if not then we just return what we have
    if (largestServer.ram < JobHelpers.ThreadCosts.weaken) return batches;

    // Next check if we can weaken the server down to it's min
    // Each weaken thread removes 0.05 security
    const idealThreads = Math.ceil((currSec - this.serverMinSec) / 0.05);
    const idealCost = idealThreads * JobHelpers.ThreadCosts.weaken;
    // If we could, then create the job and return
    if (idealCost <= largestServer.ram) {
      const server = this.network.findSuitableServer(idealCost) as string;
      this.network.reserveRam(server, idealCost);
      batches.push([{ type: JobTypes.weaken1, hostServer: server, threads: idealThreads }]);
      return batches;
    }

    // Finally, if the job was too large, we'll do the largest one we can right now and have to do more later
    const greatestPossibleThreads = Math.floor(largestServer.ram / JobHelpers.ThreadCosts.weaken);
    const possibleCost = greatestPossibleThreads * JobHelpers.ThreadCosts.weaken;
    this.network.reserveRam(largestServer.name, possibleCost);

    batches.push([{ type: JobTypes.weaken1, hostServer: largestServer.name, threads: greatestPossibleThreads }]);
    return this.weakenServerBatches(currSec - greatestPossibleThreads * 0.05, batches);
  }

  private growServerBatches(currMoney: number, batches: gwBatch[] = []): gwBatch[] {
    // First check if the network has enough ram to run both a grow and weaken thread at least.
    if (this.network.largestServer.ram < JobHelpers.ThreadCosts.grow + JobHelpers.ThreadCosts.weaken) return batches;

    // Otherwise, check if we can get to the max in a single batch
    const idealGrowThreads = this.nsx.ns.growthAnalyze(this.targetName, this.maxMoney / currMoney);
    const idealGrowCost = idealGrowThreads * JobHelpers.ThreadCosts.grow;
    const idealGrowServer = this.network.findSuitableServer(idealGrowCost);
    this.network.reserveRam(idealGrowServer, idealGrowCost);

    const idealWeakenThreads = JobHelpers.calcWeaken2Threads(idealGrowThreads);
    const idealWeakenCost = idealWeakenThreads * JobHelpers.ThreadCosts.weaken;
    const idealWeakenServer = this.network.findSuitableServer(idealWeakenCost);
    // If we were able to finish growing the server then return early
    if (idealGrowServer !== undefined && idealWeakenServer !== undefined) {
      this.network.reserveRam(idealWeakenServer, idealWeakenCost);
      batches.push([
        {
          hostServer: idealGrowServer,
          threads: idealGrowThreads,
          type: JobTypes.grow,
        },
        {
          hostServer: idealWeakenServer,
          threads: idealWeakenThreads,
          type: JobTypes.weaken2,
        },
      ]);
      return batches;
    }
    if (idealWeakenServer === undefined) {
      this.network.unreserveRam(idealGrowServer, idealGrowCost);
    }

    // For the final case, we need to create the largest batch we can
    // The ideal situation is to find the largest batch for both weakens and grows
    // This would require a lot of math and repetition for something that would probably not make that large of a difference
    // So, we instead use a heuristic:
    // We simply take the largest server and fit as many weaken and grow threads onto that server
    // This allows us to get relatively close in much less work

    // This implementation requires grow and weaken to have the same cost which should always be true
    // But will need to be updated if that ever becomes false
    const realServer = this.network.largestServer;
    let availableThreads = Math.floor(realServer.ram / JobHelpers.ThreadCosts.grow);

    // Need 1 weakenThread for 12.5 growThreads
    const weakenThreads = Math.ceil(availableThreads / 13.5);
    // This now represents the grow threads available on the server
    availableThreads -= weakenThreads;
    const growThreads = availableThreads;

    batches.push([
      {
        hostServer: realServer.name,
        threads: growThreads,
        type: JobTypes.grow,
      },
      {
        hostServer: realServer.name,
        threads: weakenThreads,
        type: JobTypes.weaken2,
      },
    ]);

    // Remember to reserve ram
    this.network.reserveRam(realServer.name, JobHelpers.ThreadCosts.grow * growThreads);
    this.network.reserveRam(realServer.name, JobHelpers.ThreadCosts.weaken * weakenThreads);

    // Keep trying until we run out of ram or until we finish the server
    const newMoney = calcGrowthFromThreads(currMoney, growThreads, this.serverGrowth);
    return this.growServerBatches(newMoney, batches);
  }

  public batchGrowth(batches: (gwBatch | wBatch)[], batchNum = 0, money: number = this.serverMoney): number {
    if (batchNum == batches.length) return money;
    // Check if this is a grow batch
    if (batches[batchNum][0].type != JobTypes.grow) return this.batchGrowth(batches, batchNum + 1, money);
    const threads = batches[batchNum][0].threads;
    money = calcGrowthFromThreads(money, threads, this.serverGrowth);
    return this.batchGrowth(batches, batchNum + 1, money);
  }
}

export function autocomplete(data: AutocompleteData, _args: ScriptArg) {
  return [...data.servers, `--tail`];
}
