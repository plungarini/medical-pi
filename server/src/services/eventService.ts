import { EventEmitter } from "node:events";

export const liveEvents = new EventEmitter();

// Allow many concurrent SSE connections
liveEvents.setMaxListeners(100);

export function emitLiveEvent(userId: string, event: string, data: any) {
  // We emit with the userId prefix so that we can filter events per user
  // (though right now it's mostly single-user on the Pi, it's good practice)
  liveEvents.emit(`user:${userId}`, { event, data });
}
