import { train, evaluate } from "./engine.js";
self.onmessage = ({ data }) => {
  try {
    const result =
      data.type === "train"
        ? train(data.items, data.events, data.version, data.recipe)
        : evaluate(data.items, data.events, data.k, data.recipe);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message });
  }
};
