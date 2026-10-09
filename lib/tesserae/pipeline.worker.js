// Runs the tessellation off the main thread, so the page stays responsive while it works.
import { tessPipeline } from "./pipeline.js";

self.onmessage = (event) => {
  try {
    tessPipeline(event.data, (message, transfer) =>
      self.postMessage(message, transfer ?? []),
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      job: event.data.job,
      message: String(error?.stack ?? error),
    });
  }
};
