import { NS } from '@ns';
import { IWorker } from '@/libs/controller-functions';

// Shouldn't be run manually
export async function main(ns: NS) {
  const args: IWorker = JSON.parse(ns.args[0]);
  // Ideally, we would add just the extra time between the proposed ending time and the time it would end naturally
  let waitingTime = args.endTime - args.workTime;

  // However, since the script has some start up time, we also need to account for the fact that they will desync by some small amount
  ns.writePort(args.portNum, ns.pid);
  // When reading the port it will look like this:
  // [pid, offset]
  let timeSlept = 0;
  do {
    // Check if this offset is the one for this script
    if (JSON.parse(ns.peek(args.portNum))[0] == ns.pid) {
      waitingTime += ns.readPort(args.portNum)[1];
      break;
    }
    await ns.asleep(1);
    timeSlept += 1;
  } while (true);

  await ns.hack(args.target, { additionalMsec: waitingTime - timeSlept });
}
