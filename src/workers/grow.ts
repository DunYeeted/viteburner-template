import { NS } from '@ns';
import { IWorker, TIME_BETWEEN_BATCHES, TIME_BETWEEN_JOBS } from '@/libs/controller-functions';
import { PortErrors } from '@/libs/ExpandedNS';

// Shouldn't be run manually
export async function main(ns: NS) {
  const args: IWorker = JSON.parse(ns.args[0]);
  if (args.portNum == PortErrors.UNDEFINED_PORT_NUM_ERROR) ns.exit();
  await ns.nextPortWrite(args.portNum);
  /** @description The endTime of the first job ran, which may or may not be the endTime */
  const baseEndTime: number = JSON.parse(ns.peek(args.portNum)) - performance.now();
  const endTime = baseEndTime + args.batchNum * TIME_BETWEEN_BATCHES + args.jobNum * TIME_BETWEEN_JOBS;
  const waitingTime = endTime - args.workTime;

  await ns.grow(args.target, { additionalMsec: waitingTime });
  ns.writePort(args.portNum, ns.pid);
}
