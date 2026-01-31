import { ExpandedNS, PortErrors } from '@/libs/ExpandedNS';
import { Batcher, BatchHelpers, hwgwBatch, IJob, JobHelpers, RamNet } from '@/libs/controller-functions';
import { NS } from '@ns';

/** @description How deep the shotgun batcher will go before stopping
 *
 * The function will change how much it steals by targetServerMaxMoney / (2^RESOLUTION)
 */
const RESOLUTION = 8;

export async function main(ns: NS) {
  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
      ./batch-makers/shotgun-batcher.js <server>
      ./batch-makers/shotgun-batcher.js foodnstuff`);
    return;
  }
  const nsx = new ExpandedNS(ns);

  const targetName: string = ns.args[0];
  const batcher = new ShotgunBatcher(nsx, new RamNet(nsx), targetName);

  const batches = batcher.createBatchesList();

  // Now that we're done, check if we made any batches
  if (batches.length == 0) {
    nsx.scriptError(`Failed to create any batches for ${batcher.targetName}`);
  }

  const portNum = await nsx.requestPort();

  while (Batcher.isPrepped(ns, targetName)) {
  }
}

class ShotgunBatcher extends Batcher {
  constructor(nsx: ExpandedNS, network: RamNet, target: string) {
    super(nsx, network, target, nsx.ns.getServerMaxMoney(target), undefined, nsx.ns.getHackTime(target));
  }

  public set setPort(portNum: number) {
    this.port = this.nsx.ns.getPortHandle(portNum);
  }

  public createBatchesList(): hwgwBatch[] {
    const batches: hwgwBatch[] = [];
    // Create batches
    while (true) {
      let bestBatch: hwgwBatch | undefined;
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
        }
      }

      // Once we've gone through everything above then we can check what the largest batch we can create is
      // If we failed to create any batch, then stop making more
      if (bestBatch == undefined) break;
      // Otherwise, push the batch we created and start over creating another batch
      BatchHelpers.unreserveBatch(this.network, bestBatch);
      batches.push(bestBatch);
    }

    return batches;
  }

  private createSingleBatch(percentStealing: number): hwgwBatch | undefined {
    // First, check how many threads are necessary for each job
    const hackThreads = Math.floor(this.nsx.ns.hackAnalyzeThreads(this.targetName, percentStealing * this.maxMoney));
    const hackCost = JobHelpers.calculateServerlessJobCost(hackThreads, `hack`);
    const growThreads = Math.ceil(
      this.nsx.calcGrowThreads(this.targetName, this.maxMoney - hackThreads * this.nsx.ns.hackAnalyze(this.targetName)),
    );
    const growCost = JobHelpers.calculateServerlessJobCost(growThreads, `grow`);

    let hackServer: string | undefined;
    let growServer: string | undefined;

    // Check if we can find a server that can support these threads
    if (hackCost > growCost) {
      hackServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(hackThreads, `hack`));
      this.network.reserveRam(hackServer, hackCost);
      growServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(growThreads, `grow`));
      this.network.reserveRam(growServer, growCost);
    } else {
      growServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(growThreads, `grow`));
      this.network.reserveRam(growServer, growCost);
      hackServer = this.network.findSuitableServer(JobHelpers.calculateServerlessJobCost(hackThreads, `hack`));
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
    const weaken1Threads = Math.ceil(hackThreads / 25);
    const weaken1Cost = JobHelpers.calculateServerlessJobCost(weaken1Threads, `weaken1`);
    const weaken2Threads = Math.ceil(growThreads / 12.5);
    const weaken2Cost = JobHelpers.calculateServerlessJobCost(weaken2Threads, `weaken2`);

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
      type: `hack`,
      threads: hackThreads,
      hostServer: hackServer,
    };

    const growJob: IJob = {
      type: `grow`,
      threads: growThreads,
      hostServer: growServer,
    };

    const weaken1Job: IJob = {
      type: `weaken1`,
      threads: weaken1Threads,
      hostServer: weaken1Server,
    };

    const weaken2Job: IJob = {
      type: `weaken2`,
      threads: weaken2Threads,
      hostServer: weaken2Server,
    };

    const batch: hwgwBatch = [hackJob, weaken1Job, growJob, weaken2Job];

    BatchHelpers.unreserveBatch(this.network, batch);

    return batch;
  }
}