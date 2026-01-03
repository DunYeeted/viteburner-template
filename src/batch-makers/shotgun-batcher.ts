import { requestPort } from '@/daemons/port-controller';
import { ExpandedNS } from '@/libs/ExpandedNS';
import { Batch, calculateServerlessJobCost, isPrepped, Job, RamNet } from '@/libs/controller-functions';
import { NS } from '@ns';

const RESOLUTION = 8;
let SERVER_NAME: string;
let SERVER_MAX_MONEY: number;
let nsx: ExpandedNS;
let network: RamNet;

export async function main(ns: NS) {
  if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
    ns.tprint(`Incorrect usage!:
      ./batch-makers/shotgun-batcher.js <server>
      ./batch-makers/shotgun-batcher.js foodnstuff`);
    return;
  }
  nsx = new ExpandedNS(ns);
  network = new RamNet(nsx);
  SERVER_NAME = ns.args[0];
  SERVER_MAX_MONEY = ns.getServerMaxMoney(SERVER_NAME);

  const batches: Batch[] = [];
  // Create batches
  while (true) {
    let bestBatch: Batch | undefined;
    // Create one singular batch that is as large as possible
    let UPPER = 0;
    let LOWER = 1;

    for (let i = 0; i < RESOLUTION; i++) {
      const STEAL_PERCENT = 0.5 * (UPPER + LOWER);
      const batch = createBatch(ns, STEAL_PERCENT);

      // If we failed to create a batch at this steal percent, we need to lower the next steal percent
      if (batch == undefined) {
        UPPER = STEAL_PERCENT;
      } else {
        // If we succeeded we can try to increase the steal percent
        LOWER = STEAL_PERCENT;
        // Remember to update our best possible batch
        bestBatch = batch;
      }
    }

    // Once we've gone through everything above then we can check what the largest batch we can create is
    // If we failed to create any batch, then stop making more
    if (bestBatch == undefined) break;
    // Otherwise, push the batch we created and start over creating another batch
    network.reserveBatch(bestBatch);
    batches.push(bestBatch);
  }

  // Now that we're done, check if we made any batches
  if (batches.length <= 0) {
    ns.alert(`Failed to create any batches for ${SERVER_NAME}`);
    return;
  }

  const port = await requestPort(ns);

  while (isPrepped(ns, SERVER_NAME)) {

  }
}

function createBatch(ns: NS, percentStealing: number): Batch | undefined {
  // First, check how many threads are necessary for each job
  const hackThreads = Math.floor(ns.hackAnalyzeThreads(SERVER_NAME, percentStealing * SERVER_MAX_MONEY));
  const hackCost = calculateServerlessJobCost(hackThreads, `hack`);
  const growThreads = Math.ceil(ns.growthAnalyze(SERVER_NAME, 1 / (1 - percentStealing)));
  const growCost = calculateServerlessJobCost(growThreads, `grow`);

  let hackServer: string | undefined;
  let growServer: string | undefined;

  // Check if we can find a server that can support these threads
  if (hackCost > growCost) {
    hackServer = network.findSuitableServer(calculateServerlessJobCost(hackThreads, `hack`));
    network.reserveRamOnServer(hackServer, hackCost);
    growServer = network.findSuitableServer(calculateServerlessJobCost(growThreads, `grow`));
    network.reserveRamOnServer(growServer, growCost);
  } else {
    growServer = network.findSuitableServer(calculateServerlessJobCost(growThreads, `grow`));
    network.reserveRamOnServer(growServer, growCost);
    hackServer = network.findSuitableServer(calculateServerlessJobCost(hackThreads, `hack`));
    network.reserveRamOnServer(hackServer, hackCost);
  }

  // Fails if we cannot
  if (hackServer == undefined || growServer == undefined) {
    network.undoReserve(hackServer, hackCost);
    network.undoReserve(growServer, growCost);
    return undefined;
  }

  // Also check if we can find servers to host the weakens
  // Technically, we should do the same thing as above, but it probably doesn't make a big difference so who cares
  const weaken1Threads = Math.ceil(hackThreads / 25);
  const weaken1Cost = calculateServerlessJobCost(weaken1Threads, `weaken1`);
  const weaken2Threads = Math.ceil(growThreads / 12.5);
  const weaken2Cost = calculateServerlessJobCost(weaken2Threads, `weaken2`);

  const weaken1Server = network.findSuitableServer(weaken1Cost);
  network.reserveRamOnServer(weaken1Server, weaken1Cost);
  const weaken2Server = network.findSuitableServer(weaken2Cost);
  network.reserveRamOnServer(weaken2Server, weaken2Cost);

  if (weaken1Server == undefined || weaken2Server == undefined) {
    network.undoReserve(weaken1Server, weaken1Cost);
    network.undoReserve(weaken2Server, weaken2Cost);
    return undefined;
  }

  const hackJob: Job = {
    type: `hack`,
    threads: hackThreads,
    server: hackServer,
  };

  const growJob: Job = {
    type: `grow`,
    threads: growThreads,
    server: growServer,
  };

  const weaken1Job: Job = {
    type: `weaken1`,
    threads: weaken1Threads,
    server: weaken1Server,
  };

  const weaken2Job: Job = {
    type: `weaken2`,
    threads: weaken2Threads,
    server: weaken2Server,
  };

  const batch = {
    hack: hackJob,
    weaken1: weaken1Job,
    grow: growJob,
    weaken2: weaken2Job,
  };

  network.undoReserveBatch(batch);

  return batch;
}
