import { Batcher, BatchHelpers, hwgwBatch, JobHelpers, IJob } from '@/libs/controller-functions/Batcher';
import { JobTypes } from '@/libs/controller-functions/Constants';
import { RamNet } from '@/libs/controller-functions/RamNet';
import { ExpandedNS } from '@/libs/ExpandedNS';
import { PortHelpers } from '@/libs/Ports';
import { AutocompleteData, NS, ScriptArg } from '@ns';
// TODO: This script currently doesn't account for level ups that occur due to jobs, causing the server to become unprepped frequently
// When the player levels up frequently
//
// When the player levels up once or twice over a whole shotgun batch then it doesn't make too much of an issue since the grow threads
//   overcorrect by default (since they are rounded up) However if they level up >100 times it causes major issues

/**
 * How deep the shotgun batcher will go before stopping
 *
 * The function will change how much it steals by targetServerMaxMoney / (2^RESOLUTION)
 */
const RESOLUTION = 8;

export async function main(ns: NS) {
  if (performance.now() < 10000) await ns.asleep(10000);

  const nsx = new ExpandedNS(ns);

  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
  ./batch-makers/shotgun-batcher.js <server>
  ./batch-makers/shotgun-batcher.js foodnstuff`);
    return;
  }

  ns.disableLog(`ALL`);
  ns.enableLog(`print`);

  Batcher.uploadScripts(nsx);

  const targetName: string = ns.args[0];
  const sgBatcher = new ShotgunBatcher(nsx, new RamNet(nsx), targetName);
  if (sgBatcher.totalRam < (3 * JobHelpers.ThreadCosts.grow + JobHelpers.ThreadCosts.hack)) {
    nsx.scriptError(`Unable to create any batches, might not be enough ram
Is there another batcher script currently running?`);
  }
  let batches = sgBatcher.createBatchesList();

  // Once we finish, check if we made any batches
  if (batches.length == 0) {
    nsx.scriptError(`Failed to create any batches for ${sgBatcher.targetName}`);
  }

  const portNum = await PortHelpers.requestPort(nsx);
  sgBatcher.port = portNum;

  // ---Logging function---
  const hackChance = ns.hackAnalyzeChance(targetName);
  let endTime = 0;
  const prospectPercent = sgBatcher.totalPercentStolen(batches) * hackChance * ns.hackAnalyzeChance(targetName);
  const logger = setInterval(() => {
    ns.clearLog();
    ns.print(`Hacking ${targetName}`);
    ns.print(`Empty ram: ${ns.format.ram(sgBatcher.totalRam)}`);
    ns.print(`Stealing: ~$${ns.format.number(prospectPercent * sgBatcher.maxMoney)} (${ns.format.percent(prospectPercent)})`);
    ns.print(`Active workers: ${sgBatcher.workersRunning}`);
    ns.print(`ETA: ${ns.format.time(endTime - performance.now())}`);
  }, 1000);

  // Remember to clear the timer and retire the port eventually
  ns.atExit(() => {
    ns.ui.closeTail();
    PortHelpers.retirePort(nsx, sgBatcher.port);
    clearInterval(logger);
  });

  // const port = ns.getPortHandle(portNum);

  while (sgBatcher.isPrepped) {
    // Run batchList
    endTime = await sgBatcher.runAllBatches(batches);
    // Wait for the scripts to finish
    await sgBatcher.waitForFinish(endTime);
    // Finished this run through
    // Check if we levelled up
    // If we did, restart the script
    if (ns.getHackingLevel() != sgBatcher.lvl) {
      ns.print(`Levelled up, restarting...`);

      sgBatcher.resetNetwork();
      sgBatcher.updatePlayerStats();

      batches = sgBatcher.createBatchesList();
      sgBatcher.hackTime = ns.getHackTime(targetName);
    }
    // Otherwise, loop around again
  }

  ns.tprint(`Something went wrong and the server is no longer at ideal stats`);
  ns.spawn('/batch-makers/server-prepper.js', { preventDuplicates: true, threads: 1, spawnDelay: 0 }, targetName);
}

class ShotgunBatcher extends Batcher {
  public percentSingleThread: number;
  constructor(nsx: ExpandedNS, network: RamNet, targetName: string) {
    super(nsx, network, targetName);

    this.percentSingleThread = this.nsx.ns.hackAnalyze(this.targetName);
  }

  public createBatchesList(): hwgwBatch[] {
    const batches: hwgwBatch[] = [];
    // Create batches

    // If there are too many batches, that will cause the game to fucking crash (or start the infinite loop detector), stop making more
    // Unnecessary if the gap between scripts is high enough
    while (batches.length <= Batcher.MAX_LIST_SIZE) {
      let bestBatch: hwgwBatch | undefined;
      // Create one singular batch that is as large as possible
      let maxSteal = 1;
      let minSteal = 0;

      for (let i = 0; i < RESOLUTION; i++) {
        const stealPercent = 0.5 * (maxSteal + minSteal);
        // this.nsx.ns.tprint(stealPercent);
        const batch = this.createSingleBatch(stealPercent);

        // If we failed to create a batch at this steal percent, we need to lower the next steal percent
        if (batch === undefined) {
          maxSteal = stealPercent;
        } else {
          // If we succeeded we can try to increase the steal percent
          minSteal = stealPercent;
          // Update our best possible batch
          bestBatch = batch;
        }
      }
      // Once we've gone through everything above then we can check what the largest batch we can create is

      // If we failed to create any batch, then stop making more
      if (bestBatch === undefined) break;
      // Otherwise, push the batch we created and start over creating another batch
      BatchHelpers.reserveBatch(this.network, bestBatch);
      batches.push(bestBatch);
    }

    return batches;
  }

  private createSingleBatch(percentStealing: number): hwgwBatch | undefined {
    // First, check how many threads are necessary for each job
    const hackThreads = Math.max(
      Math.floor(this.nsx.ns.hackAnalyzeThreads(this.targetName, percentStealing * this._maxMoney)),
      1,
    );
    const hackCost = hackThreads * JobHelpers.ThreadCosts.hack;
    // TODO: Fix getGrowthThreads to save ram
    const growThreads = Math.ceil(this.nsx.ns.growthAnalyze(this.targetName, 1 / (1 - percentStealing)));
    const growCost = growThreads * JobHelpers.ThreadCosts.grow;

    let hackServer: string | undefined;
    let growServer: string | undefined;

    // Check if we can find a server that can support these threads
    if (hackCost > growCost) {
      hackServer = this.network.findSuitableServer(hackCost);
      this.network.reserveRam(hackServer, hackCost);
      growServer = this.network.findSuitableServer(growCost);
      this.network.reserveRam(growServer, growCost);
    } else {
      growServer = this.network.findSuitableServer(growCost);
      this.network.reserveRam(growServer, growCost);
      hackServer = this.network.findSuitableServer(hackCost);
      this.network.reserveRam(hackServer, hackCost);
    }

    if (hackServer == undefined || growServer == undefined) {
      this.network.unreserveRam(hackServer, hackCost);
      this.network.unreserveRam(growServer, growCost);
      return undefined;
    }

    // Also check if we can find servers to host the weakens
    // Technically, we should do the same thing as above, but it probably doesn't make a big difference so who cares
    const weaken1Threads = Math.ceil(JobHelpers.calcWeakenThreads(JobTypes.hack, hackThreads));
    const weaken1Cost = weaken1Threads * JobHelpers.ThreadCosts.weaken;
    const weaken2Threads = Math.ceil(JobHelpers.calcWeakenThreads(JobTypes.grow, growThreads));
    const weaken2Cost = weaken2Threads * JobHelpers.ThreadCosts.weaken;

    const weaken1Server = this.network.findSuitableServer(weaken1Cost);
    this.network.reserveRam(weaken1Server, weaken1Cost);
    const weaken2Server = this.network.findSuitableServer(weaken2Cost);
    this.network.reserveRam(weaken2Server, weaken2Cost);

    if (weaken1Server == undefined || weaken2Server == undefined) {
      this.network.unreserveRam(hackServer, hackCost);
      this.network.unreserveRam(growServer, growCost);
      this.network.unreserveRam(weaken1Server, weaken1Cost);
      this.network.unreserveRam(weaken2Server, weaken2Cost);
      return undefined;
    }

    const hackJob: IJob = {
      type: JobTypes.hack,
      threads: hackThreads,
      hostServer: hackServer,
    };

    const growJob: IJob = {
      type: JobTypes.grow,
      threads: growThreads,
      hostServer: growServer,
    };

    const weaken1Job: IJob = {
      type: JobTypes.weaken1,
      threads: weaken1Threads,
      hostServer: weaken1Server,
    };

    const weaken2Job: IJob = {
      type: JobTypes.weaken2,
      threads: weaken2Threads,
      hostServer: weaken2Server,
    };

    const batch: hwgwBatch = [hackJob, weaken1Job, growJob, weaken2Job];

    BatchHelpers.unreserveBatch(this.network, batch);

    return batch;
  }

  public totalPercentStolen(batches: hwgwBatch[], batchNum = 0, moneyStolen = 0): number {
    if (batchNum == batches.length) return moneyStolen;

    const threads = batches[batchNum][0].threads;
    moneyStolen += Math.min(this.percentSingleThread * threads, this._maxMoney);
    return this.totalPercentStolen(batches, batchNum + 1, moneyStolen);
  }

  private getGrowThreads(hackThreads: number) {
    return this.nsx.calculateGrowThreads(
      this.targetName,
      this._minSecurity,
      this.serverGrowth,
      this.playerGrowthMulti,
      this.bitnodeGrowthMulti,
      this._maxMoney * (1 - this.percentSingleThread * hackThreads),
      this._maxMoney,
    );
  }
}

export function autocomplete(data: AutocompleteData, _args: ScriptArg) {
  return [...data.servers, `--tail`];
}
