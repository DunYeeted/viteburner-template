import { ExpandedNS } from '@/libs/ExpandedNS';
import { FilesData } from '@/libs/FilesData';
import { Batcher, BatchHelpers, hwgwBatch, IJob, JobHelpers, JobTypes, RamNet } from '@/libs/controller-functions';
import { NS } from '@ns';

/** @description How deep the shotgun batcher will go before stopping
 *
 * The function will change how much it steals by targetServerMaxMoney / (2^RESOLUTION)
 */
const RESOLUTION = 8;

export async function main(ns: NS) {
  const nsx = new ExpandedNS(ns);

  ns.disableLog(`ALL`);
  ns.enableLog(`print`);

  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
      ./batch-makers/shotgun-batcher.js <server>
      ./batch-makers/shotgun-batcher.js foodnstuff`);
    return;
  }
  const targetName: string = ns.args[0];

  if (!nsx.checkForPortController()) {
    nsx.scriptError(`No port-controller running!`);
  }

  const sgBatcher = new ShotgunBatcher(nsx, new RamNet(nsx), targetName);

  const batches = sgBatcher.createBatchesList();

  // Now that we're done, check if we made any batches
  if (batches.length == 0) {
    nsx.scriptError(`Failed to create any batches for ${sgBatcher.targetName}`);
  }

  const portNum = await nsx.requestPort();
  sgBatcher.port = portNum;
  const hackingLvl = ns.getHackingLevel();

  // ---Logging function---
  const hackChance = ns.hackAnalyzeChance(targetName);
  let endTime = 0;
  const logger = setInterval(() => {
    ns.clearLog();
    ns.print(`Hacking: ${ns.args[0]}`);
    ns.print(`Empty ram: ${sgBatcher.totalRam}`);
    ns.print(
      `Stealing: $${ExpandedNS.decimalRound(
        sgBatcher.percentStolen * ns.getServerMaxMoney(targetName) * hackChance,
        2,
      )} (${ExpandedNS.decimalRound(sgBatcher.percentStolen * hackChance * 100, 1)}%)`,
    );
    ns.print(`Active workers: ${sgBatcher.runningScripts.length}`);
    ns.print(`Expected Finish time: ${ns.tFormat(endTime)}`);
  }, 1000);
  // Remember to clear the timer and retire the port eventually
  ns.atExit(() => {
    nsx.retirePort(portNum);
    clearInterval(logger);
  });
  const port = ns.getPortHandle(portNum);

  while (Batcher.isPrepped(ns, targetName)) {
    // Run each batch
    for (let i = 0; i < batches.length; i++) {
      sgBatcher.runningScripts.push(...(await sgBatcher.runBatch(batches[i], i)));
    }
    // Need to give the start signal to the queued workers
    endTime = performance.now() + sgBatcher.weakenTime + BatchHelpers.BufferTime;
    await sgBatcher.sendStartSignal(endTime);

    // Wait for the scripts to finish
    while (sgBatcher.runningScripts.length > 0) {
      await ns.nextPortWrite(portNum);
      if (!port.empty()) {
        sgBatcher.runningScripts.splice(sgBatcher.runningScripts.indexOf(port.read()), 1);
      }
    }
    // Finished this run through
    // Check if we levelled up
    // If we did, restart the script
    if (ns.getHackingLevel() !== hackingLvl) {
      ns.spawn(FilesData['Batcher'].path, { spawnDelay: 0 }, ...ns.args);
    }
    // Otherwise, loop around again
  }
}

class ShotgunBatcher extends Batcher {
  public runningScripts: number[] = [];
  public percentStolen: number;
  constructor(nsx: ExpandedNS, network: RamNet, target: string) {
    super(nsx, network, target, nsx.ns.getServerMaxMoney(target), undefined, nsx.ns.getHackTime(target));

    this.percentStolen = 0;
  }

  public createBatchesList(): hwgwBatch[] {
    const batches: hwgwBatch[] = [];
    // Create batches
    while (true) {
      let bestBatch: hwgwBatch | undefined;
      let bestSteal: number | undefined;
      // Create one singular batch that is as large as possible
      let maxSteal = 0;
      let minSteal = 1;

      for (let i = 0; i < RESOLUTION; i++) {
        const stealPercent = 0.5 * (maxSteal + minSteal);
        const batch = this.createSingleBatch(stealPercent);

        // If we failed to create a batch at this steal percent, we need to lower the next steal percent
        if (batch == undefined) {
          maxSteal = stealPercent;
        } else {
          // If we succeeded we can try to increase the steal percent
          minSteal = stealPercent;
          // Remember to update our best possible batch
          bestBatch = batch;
          bestSteal = stealPercent;
        }
      }

      // Once we've gone through everything above then we can check what the largest batch we can create is
      // If we failed to create any batch, then stop making more
      if (bestBatch === undefined || bestSteal === undefined) break;
      // Otherwise, push the batch we created and start over creating another batch
      BatchHelpers.unreserveBatch(this.network, bestBatch);
      this.percentStolen += bestSteal;
      batches.push(bestBatch);
    }

    return batches;
  }

  private createSingleBatch(percentStealing: number): hwgwBatch | undefined {
    // First, check how many threads are necessary for each job
    const hackThreads = Math.floor(this.nsx.ns.hackAnalyzeThreads(this.targetName, percentStealing * this.maxMoney));
    const hackCost = JobHelpers.calculateServerlessJobCost(hackThreads, JobTypes.hack);
    const growThreads = this.nsx.calcGrowThreads(
      this.targetName,
      this.maxMoney - hackThreads * this.nsx.ns.hackAnalyze(this.targetName),
    );
    const growCost = JobHelpers.calculateServerlessJobCost(growThreads, JobTypes.grow);

    let hackServer: string | undefined;
    let growServer: string | undefined;

    // Check if we can find a server that can support these threads
    if (hackCost > growCost) {
      hackServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(hackThreads, JobTypes.hack));
      this.network.reserveRam(hackServer, hackCost);
      growServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(growThreads, JobTypes.grow));
      this.network.reserveRam(growServer, growCost);
    } else {
      growServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(growThreads, JobTypes.grow));
      this.network.reserveRam(growServer, growCost);
      hackServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(hackThreads, JobTypes.hack));
      this.network.reserveRam(hackServer, hackCost);
    }

    // Fails if we cannot
    if (hackServer == undefined || growServer == undefined) {
      this.network.unreserveRam(hackServer, hackCost);
      this.network.unreserveRam(growServer, growCost);
      return undefined;
    }

    // Also check if we can find servers to host the weakens
    // Technically, we should do the same thing as above, but it probably doesn't make a big difference so who cares
    const weaken1Threads = JobHelpers.calcWeaken1Threads(hackThreads);
    const weaken1Cost = JobHelpers.calculateServerlessJobCost(weaken1Threads, JobTypes.weaken1);
    const weaken2Threads = JobHelpers.calcWeaken2Threads(growThreads);
    const weaken2Cost = JobHelpers.calculateServerlessJobCost(weaken2Threads, JobTypes.weaken2);

    const weaken1Server = this.network.findSuitableServer(weaken1Cost);
    this.network.reserveRam(weaken1Server, weaken1Cost);
    const weaken2Server = this.network.findSuitableServer(weaken2Cost);
    this.network.reserveRam(weaken2Server, weaken2Cost);

    if (weaken1Server == undefined || weaken2Server == undefined) {
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
}
