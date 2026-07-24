/**
 * Main Audio Engine and Offline WAV Renderer
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    this.isInitialized = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  getCurrentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMasterVolume(val) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Renders a sequence/effect in the background using OfflineAudioContext
   * and returns a Blob containing a 16-bit PCM encoded WAV file.
   */
  async renderOfflineWav(renderScheduleCallback, durationSeconds = 4) {
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * durationSeconds, sampleRate);
    
    const offlineMaster = offlineCtx.createGain();
    offlineMaster.gain.value = 0.8;
    offlineMaster.connect(offlineCtx.destination);

    // Execute scheduled synthesis inside offlineCtx
    renderScheduleCallback(offlineCtx, offlineMaster);

    const renderedBuffer = await offlineCtx.startRendering();
    return this.encodeWAV(renderedBuffer);
  }

  /**
   * Converts an AudioBuffer to a WAV file Blob (16-bit PCM Stereo)
   */
  encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const left = audioBuffer.getChannelData(0);
    const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const length = left.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    /* RIFF identifier */
    this.writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + length, true);
    /* RIFF format */
    this.writeString(view, 8, 'WAVE');
    /* Subchunk1 identifier */
    this.writeString(view, 12, 'fmt ');
    /* Subchunk1 size */
    view.setUint32(16, 16, true);
    /* Audio format (1 = PCM) */
    view.setUint16(20, format, true);
    /* Number of channels */
    view.setUint16(22, numChannels, true);
    /* Sample rate */
    view.setUint32(24, sampleRate, true);
    /* Byte rate */
    view.setUint32(28, sampleRate * numChannels * 2, true);
    /* Block align */
    view.setUint16(32, numChannels * 2, true);
    /* Bits per sample */
    view.setUint16(34, bitDepth, true);
    /* Subchunk2 identifier */
    this.writeString(view, 36, 'data');
    /* Subchunk2 size */
    view.setUint32(40, length, true);

    /* Interleave channels PCM 16-bit */
    let offset = 44;
    for (let i = 0; i < left.length; i++) {
      let sLeft = Math.max(-1, Math.min(1, left[i]));
      view.setInt16(offset, sLeft < 0 ? sLeft * 0x8000 : sLeft * 0x7FFF, true);
      offset += 2;

      let sRight = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, sRight < 0 ? sRight * 0x8000 : sRight * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
