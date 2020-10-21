class BypassProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      // Handling data from the node.
      console.log(event.data);
    };

    this.port.postMessage("Hi!");
    this.port.onmessage = (event) => this._addAudio(event);

    this._audio = [];
    this._currentPosition = 0;
  }

  _addAudio({ data }) {
    for (let channel = 0; channel < data.length; channel++) {
      if (!this._audio[channel]) this._audio[channel] = new Float32Array(0);

      const oldAudio = this._audio[channel].subarray(this._currentPosition);
      const floatData = new Float32Array(data[channel]);

      const audio = new Float32Array(oldAudio.length + floatData.length);
      audio.set(oldAudio);
      audio.set(floatData, oldAudio.length);

      this._audio[channel] = audio;
    }

    this._currentPosition = 0;
  }

  process(inputs, outputs) {
    if (this._audio.length) {
      const output = outputs[0];
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].set(
          this._audio[channel].subarray(
            this._currentPosition,
            this._currentPosition + 128
          )
        );
      }

      this._currentPosition += 128;
    }

    return true;
  }
}

class WhiteNoiseProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    output.forEach((channel) => {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1;
      }
    });
    return true;
  }
}

registerProcessor("white-noise-processor", WhiteNoiseProcessor);
registerProcessor("bypass-processor", BypassProcessor);
