import { Batcher, BatchList, gBatch, JobHelpers } from '@/libs/controller-functions/Batcher';
import { JobTypes } from '@/libs/controller-functions/Constants';
import { RamNet } from '@/libs/controller-functions/RamNet';
import { ExpandedNS } from '@/libs/ExpandedNS';
import { PortHelpers } from '@/libs/Ports';
import { NS } from '@ns';

export async function main(ns: NS) {
  if (performance.now() < 10000) await ns.asleep(10000);

  const nsx = new ExpandedNS(ns);

  // if (ns.args.length != 1 || typeof ns.args[0] !== `string`) {
  //   ns.tprint(`Incorrect usage!:
  // ./batch-makers/exp-farmer.js <server>
  // ./batch-makers/exp-farmer.js foodnstuff`);
  //   return;
  // }
  ns.disableLog(`ALL`);
  ns.enableLog(`print`);

  const targetName: string = <string>ns.args[0] ?? 'joesguns';
  const expBatcher = new ExpFarmer(nsx, targetName);
  const batches = expBatcher.createBatchesList();

  // Once we finish, check if we made any batches
  if (batches.length == 0) {
    nsx.scriptError(`Failed to create any batches for ${expBatcher.targetName}`);
  }

  const portNum = await PortHelpers.requestPort(nsx);
  expBatcher.port = portNum;

  // ---Logging function---
  let endTime = 0;
  const logger = setInterval(() => {
    ns.clearLog();
    ns.print(`Farming ${targetName}`);
    ns.print(`Empty ram: ${ns.format.ram(expBatcher.totalRam)}`);
    ns.print(`Active workers: ${expBatcher.workersRunning}`);
    ns.print(`ETA: ${ns.format.time(endTime - performance.now())}`);
  }, 1000);

  ns.atExit(() => {
    ns.ui.closeTail();
    PortHelpers.retirePort(nsx, expBatcher.port);
    clearInterval(logger);
  });

  while (expBatcher.isPrepped) {
    // Run batchList
    endTime = await expBatcher.runAllBatches(batches);
    // Wait for the scripts to finish
    await expBatcher.waitForFinish(endTime);
  }
}

class ExpFarmer extends Batcher {
  constructor(nsx: ExpandedNS, target: string) {
    super(nsx, new RamNet(nsx), target);
  }

  createBatchesList(): BatchList {
    const batches: gBatch[] = [];
    const servers = this.nsx.scanAdminServers();
    for (const serverName of servers) {
      const threads = Math.floor(this.nsx.emptyRam(serverName) / JobHelpers.ThreadCosts.grow);
      if (threads <= 0) continue;
      batches.push([
        {
          hostServer: serverName,
          threads: threads,
          type: JobTypes.grow,
        },
      ]);
    }
    // console.log(batches);
    return batches;
  }
}
