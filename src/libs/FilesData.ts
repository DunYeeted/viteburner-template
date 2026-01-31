export const FilesData: {
  [file: string]: { path: string; filename: string; ramCost: number };
} = {
  PortController: {
    path: `./daemons/max-ports.js`,
    filename: `max-ports.js`,
    ramCost: 0,
  },
  hackWorker: {
    path: `./workers/hack.js`,
    filename: `hack.js`,
    ramCost: 0,
  },
  growWorker: {
    path: `./workers/grow.js`,
    filename: `grow.js`,
    ramCost: 0,
  },
  weakenWorker: {
    path: `./workers/weaken.js`,
    filename: `weaken.js`,
    ramCost: 0,
  },
  os: {
    path: `./daemons/adaOS.js`,
    filename: `adaOS.js`,
    ramCost: 0,
  },
  batcher: {
    path: `./batch-makers/shotgun-batcher.js`,
    filename: `shotgun-batcher.js`,
    ramCost: 0,
  },
  serverPreparer: {
    path: `./batch-makers/server-prepper.js`,
    filename: `server-preppers.js`,
    ramCost: 0,
  },
};
