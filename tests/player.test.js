import test from "node:test";
import assert from "node:assert/strict";
import { PreviewPlayer } from "../src/player.js";

test("preview engagement counts playback time, excludes seek jumps, and records once", async (t) => {
  let clock = 0,
    listens = 0;
  t.mock.method(performance, "now", () => clock);
  const oldAudio = globalThis.Audio,
    oldLocation = globalThis.location;
  class FakeAudio extends EventTarget {
    currentTime = 0;
    duration = 30;
    paused = true;
    seeking = false;
    ended = false;
    async play() {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
    removeAttribute() {}
    load() {}
  }
  globalThis.Audio = FakeAudio;
  globalThis.location = { href: "http://localhost/spotiswipe/" };
  t.after(() => {
    globalThis.Audio = oldAudio;
    globalThis.location = oldLocation;
  });
  const p = new PreviewPlayer({
    onChange() {},
    onError(e) {
      throw Error(e);
    },
    onListen() {
      listens++;
    },
  });
  await p.play({ id: "one", previewUrl: "assets/previews/moil.mp3" });
  const tick = (seconds) => {
    clock += 1000;
    p.audio.currentTime = seconds;
    p.audio.dispatchEvent(new Event("timeupdate"));
  };
  tick(1);
  tick(2);
  p.audio.seeking = true;
  p.audio.currentTime = 20;
  p.audio.dispatchEvent(new Event("seeking"));
  p.audio.seeking = false;
  p.audio.dispatchEvent(new Event("seeked"));
  assert.equal(listens, 0);
  for (let i = 21; i <= 27; i++) tick(i);
  assert.equal(listens, 0);
  tick(28);
  assert.equal(listens, 1);
  tick(29);
  assert.equal(listens, 1);
  await p.play({ id: "two", previewUrl: "assets/previews/subspace.mp3" });
  assert.equal(p.heardSeconds, 0);
  assert.equal(p.listened, false);
  p.stop();
  assert.equal(p.track, null);
});
