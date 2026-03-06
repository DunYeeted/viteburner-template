import { NS } from '@ns';

// Shouldn't be run manually
export async function main(ns: NS) {
  const TIME_BETWEEN_BATCHES = 1;
  const TIME_BETWEEN_JOBS = 1;

  const args = JSON.parse(ns.args[0] as string);

  // Batchers' portNum is -4 when undefined
  if (args.portNum == -4) ns.exit();
  const port = ns.getPortHandle(args.portNum);

  if (port.empty()) await port.nextWrite();

  /** @description The endTime of the first job ran, which may or may not be the endTime */
  const baseEndTime: number = port.peek() - performance.now();
  const endTime = baseEndTime + args.batchNum * TIME_BETWEEN_BATCHES + args.jobNum * TIME_BETWEEN_JOBS;
  const waitingTime = endTime - args.workTime;

  await ns.grow(args.target, { additionalMsec: waitingTime });
  // port.write(ns.pid);
}

// ns.tprint(ns.peek(args.portNum));
