import IcecastMetadataReader from "./metadata-js/IcecastMetadataReader";
import IcecastMetadataQueue from "./metadata-js/IcecastMetadataQueue";
import AppendableBuffer from "./metadata-js/AppendableBuffer";
import { createDecoder } from "minimp3-wasm";
import mp3Parser from "mp3-parser";

export default class MetadataPlayer {
  constructor({ onMetadataUpdate }) {
    this._icecastMetadataQueue = new IcecastMetadataQueue({
      onMetadataUpdate: (meta) => onMetadataUpdate(meta),
    });
    this._audioElement = new Audio();
    this._onMetadataUpdate = onMetadataUpdate;

    this._icecast = null;
    this._streamBuffer = null;
    this._playing = false;
  }

  get playing() {
    return this._playing;
  }

  _onMetadata(value) {
    this._icecastMetadataQueue.addMetadata(
      value,
      this._sourceBuffer.timestampOffset - this._audioElement.currentTime
    );
  }

  async _createMediaSource(mimeType) {
    this._mediaSource = new MediaSource();
    this._audioElement.src = URL.createObjectURL(this._mediaSource);

    return new Promise((resolve) => {
      this._mediaSource.addEventListener(
        "sourceopen",
        () => {
          this._sourceBuffer = this._mediaSource.addSourceBuffer(mimeType);
          resolve();
        },
        { once: true }
      );
    });
  }

  _destroyMediaSource() {
    this._mediaSource = null;
    this._playPromise &&
      this._playPromise
        .then(() => this._audioElement.removeAttribute("src"))
        .then(() => this._audioElement.load())
        .catch(() => {});
  }

  async _readIcecastResponse(value) {
    this._streamBuffer = new AppendableBuffer(value.length);

    for (let i = this._icecast.next(value); i.value; i = this._icecast.next()) {
      if (i.value.stream) {
        this._streamBuffer.push(i.value.stream);
      } else {
        const currentPosition = value.length - this._streamBuffer.length;
        await this._appendSourceBuffer(this._streamBuffer.pop());

        this._streamBuffer = new AppendableBuffer(currentPosition);
        this._onMetadata(i.value);
      }
    }

    return this._appendSourceBuffer(this._streamBuffer.pop());
  }

  async _decodeToPCM(value) {
    this._streamBuffer = new AppendableBuffer(value.length);

    for (let i = this._icecast.next(value); i.value; i = this._icecast.next()) {
      if (i.value.stream) {
        this._streamBuffer.push(i.value.stream);
      } else {
        // metadata things
      }
    }

    const decoder = await createDecoder(
      this._streamBuffer.pop(),
      "/icecast-metadata-js/decoder.opt.wasm"
    );
    //return decoder.decode(0);
    return this._streamBuffer.pop();
    //return this._streamBuffer.pop().subarray(0, lastFrame);
  }

  async _appendSourceBuffer(chunk) {
    this._sourceBuffer.appendBuffer(chunk);

    return new Promise((resolve) => {
      this._sourceBuffer.addEventListener("updateend", resolve, { once: true });
    });
  }

  async fetchMimeType(endpoint) {
    const headResponse = await fetch(endpoint, {
      method: "HEAD",
      mode: "cors",
    }).catch(() => {});

    return headResponse ? headResponse : new Promise(() => {});
  }

  async fetchStream(endpoint) {
    return fetch(endpoint, {
      method: "GET",
      headers: {
        "Icy-MetaData": "1",
      },
      mode: "cors",
      signal: this._controller.signal,
    });
  }

  play(endpoint, metaInt) {
    if (this._playing) {
      this.stop();
    }

    this._playing = true;
    this._controller = new AbortController();
    /*
    const streamPromise = this.fetchStream(endpoint);

    Promise.race([this.fetchMimeType(endpoint), streamPromise])
      .then(async (res) => {
        const mimeType = res.headers.get("content-type");

        if (MediaSource.isTypeSupported(mimeType)) {
          await this._createMediaSource(mimeType);
          return streamPromise;
        } else {
          throw new Error(
            `Your browser does not support MediaSource ${mimeType}. Try using Google Chrome.`
          );
        }
      })
      */
    this.fetchStream(endpoint).then(async (res) => {
      this._playPromise = this._audioElement.play();

      this._icecast = new IcecastMetadataReader({
        icyMetaInt: parseInt(res.headers.get("Icy-MetaInt")) || metaInt,
      });

      const reader = res.body.getReader();
      const readerIterator = {
        [Symbol.asyncIterator]: () => ({
          next: () => reader.read(),
        }),
      };

      let audioContext = new AudioContext();

      await audioContext.resume();
      await audioContext.audioWorklet.addModule(
        "icecast-metadata-js/bypass-processor.js"
      );

      const node = new AudioWorkletNode(audioContext, "bypass-processor", {
        outputChannelCount: [2],
      });
      node.connect(audioContext.destination);

      for await (const chunk of readerIterator) {
        const result = await this._decodeToPCM(chunk);
        const decodedAudio = await audioContext.decodeAudioData(result.buffer);

        const channels = [
          decodedAudio.getChannelData(0).buffer,
          decodedAudio.getChannelData(1).buffer,
        ];

        node.port.postMessage(channels, channels);
        /*
        sourceArray[1] = audioContext.createBufferSource();
        sourceArray[1].connect(audioContext.destination);
        sourceArray[1].start(currentTime);

        sourceArray[1].buffer = await decodedAudio;
        currentTime += sourceArray[1].buffer.duration;

        await sourcePromise;

        sourcePromise = new Promise((resolve) => {
          sourceArray[1].addEventListener("ended", () => resolve(), {
            once: true,
          });
        });

        sourceArray.shift();*/
      }
    });
    /*.catch((e) => {
        if (e.name !== "AbortError") {
          this._onMetadataUpdate(`Error Connecting: ${e.message}`);
        }
        this._destroyMediaSource();
      });*/
  }

  stop() {
    this._playing = false;
    this._controller.abort();
    this._icecastMetadataQueue.purgeMetadataQueue();
  }
}
