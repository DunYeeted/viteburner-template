export const FilesData: {
  [file: string]: { path: string; filename: string; ramCost: number };
} = {
  PortController: {
    path: `./daemons/max-ports.js`,
    filename: `max-ports.js`,
    ramCost: 0,
  },
  HackWorker: {
    path: `./workers/hack.js`,
    filename: `hack.js`,
    ramCost: 1.7,
  },
  GrowWorker: {
    path: `./workers/grow.js`,
    filename: `grow.js`,
    ramCost: 1.75,
  },
  WeakenWorker: {
    path: `./workers/weaken.js`,
    filename: `weaken.js`,
    ramCost: 1.75,
  },
  os: {
    path: `./daemons/adaOS.js`,
    filename: `adaOS.js`,
    ramCost: 0,
  },
  Batcher: {
    path: `./batch-makers/shotgun-batcher.js`,
    filename: `shotgun-batcher.js`,
    ramCost: 0,
  },
  ServerPreparer: {
    path: `./batch-makers/server-prepper.js`,
    filename: `server-preppers.js`,
    ramCost: 0,
  },
};
