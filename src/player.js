export class PreviewPlayer {
  constructor({ onChange, onListen, onError }) {
    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.volume = 0.65;
    this.track = null;
    this.queue = [];
    this.index = 0;
    this.sequence = 0;
    this.listened = false;
    this.heardSeconds = 0;
    this.lastPosition = 0;
    this.lastTick = performance.now();
    this.onChange = onChange;
    this.onListen = onListen;
    this.onError = onError;
    for (const event of [
      "loadedmetadata",
      "timeupdate",
      "play",
      "pause",
      "ended",
      "waiting",
      "playing",
      "seeking",
      "seeked",
    ])
      this.audio.addEventListener(event, () => {
        const now = performance.now();
        if (
          event === "timeupdate" &&
          !this.audio.paused &&
          !this.audio.seeking
        ) {
          const delta = this.audio.currentTime - this.lastPosition;
          const elapsed = (now - this.lastTick) / 1000;
          if (delta > 0 && delta <= elapsed + 0.25)
            this.heardSeconds += Math.min(delta, elapsed);
          if (
            !this.listened &&
            this.heardSeconds >= Math.min(10, (this.audio.duration || 30) * 0.7)
          ) {
            this.listened = true;
            this.onListen(this.track);
          }
        }
        this.lastPosition = this.audio.currentTime;
        this.lastTick = now;
        if (event === "ended" && this.index < this.queue.length - 1)
          this.playQueue(this.queue, this.index + 1);
        else this.onChange(this);
      });
    this.audio.addEventListener("error", () => {
      if (this.track) {
        this.onError(
          "This preview could not load. Try again, or open the artist’s source page.",
        );
        this.onChange(this);
      }
    });
  }
  async play(track) {
    if (!track?.previewUrl) {
      this.onError(
        "This track has no preview. Open its source page to listen.",
      );
      return;
    }
    if (this.track?.id === track.id && !this.audio.ended) {
      if (this.audio.paused) {
        try {
          await this.audio.play();
        } catch {
          this.onError("Press play again to enable audio in this browser.");
        }
      } else this.audio.pause();
      return;
    }
    const seq = ++this.sequence;
    this.audio.pause();
    this.track = track;
    this.listened = false;
    this.heardSeconds = 0;
    this.lastPosition = 0;
    this.lastTick = performance.now();
    this.audio.src = new URL(track.previewUrl, location.href).href;
    this.onChange(this);
    try {
      await this.audio.play();
      if (seq !== this.sequence) return;
      this.onChange(this);
    } catch (error) {
      if (seq === this.sequence && error.name !== "AbortError")
        this.onError(
          "Playback could not start. Try again or open the source recording.",
        );
    }
  }
  async playQueue(tracks, index = 0) {
    this.queue = tracks.filter((t) => t.previewUrl);
    if (!this.queue.length) {
      this.onError("No previews are available in this mix.");
      return;
    }
    this.index = Math.max(0, Math.min(index, this.queue.length - 1));
    if (this.track?.id === this.queue[this.index].id) {
      this.audio.currentTime = 0;
      this.track = null;
    }
    await this.play(this.queue[this.index]);
  }
  next() {
    if (this.index < this.queue.length - 1)
      this.playQueue(this.queue, this.index + 1);
  }
  previous() {
    if (this.audio.currentTime > 3) this.audio.currentTime = 0;
    else if (this.index > 0) this.playQueue(this.queue, this.index - 1);
  }
  stop() {
    this.sequence++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.track = null;
    this.queue = [];
    this.index = 0;
    this.onChange(this);
  }
  pause() {
    this.audio.pause();
  }
  seek(seconds) {
    if (Number.isFinite(this.audio.duration))
      this.audio.currentTime = Math.max(
        0,
        Math.min(this.audio.duration, seconds),
      );
  }
}
