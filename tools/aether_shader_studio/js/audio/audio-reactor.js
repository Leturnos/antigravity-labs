export class AudioReactor {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.audioElement = null;
    this.mediaStream = null;
    this.currentMode = 'none'; // 'none' | 'mic' | 'file'

    this.fftSize = 1024;
    this.binCount = 512;

    this.frequencyBuffer = new Uint8Array(this.binCount);
    this.waveformBuffer = new Uint8Array(this.binCount);
    this.waveformBuffer.fill(128);

    this.packedBuffer = new Uint8Array(this.binCount * 2);
    this.updatePackedBuffer();
  }

  ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = 0.8;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  async startMicrophone() {
    this.ensureContext();
    this.stopCurrentSource();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this environment');
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.ctx.createMediaStreamSource(this.mediaStream);
    this.source.connect(this.analyser);
    this.currentMode = 'mic';
  }

  async loadAudioFile(fileBlob) {
    this.ensureContext();
    this.stopCurrentSource();

    this.audioElement = new Audio();
    this.audioElement.src = URL.createObjectURL(fileBlob);
    this.audioElement.loop = true;
    this.audioElement.crossOrigin = 'anonymous';

    this.source = this.ctx.createMediaElementSource(this.audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    await this.audioElement.play();
    this.currentMode = 'file';
  }

  stopCurrentSource() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    this.frequencyBuffer.fill(0);
    this.waveformBuffer.fill(128);
    this.updatePackedBuffer();
    this.currentMode = 'none';
  }

  update() {
    if (this.analyser && this.currentMode !== 'none') {
      this.analyser.getByteFrequencyData(this.frequencyBuffer);
      this.analyser.getByteTimeDomainData(this.waveformBuffer);
    }
    this.updatePackedBuffer();
  }

  updatePackedBuffer() {
    this.packedBuffer.set(this.frequencyBuffer, 0);
    this.packedBuffer.set(this.waveformBuffer, this.binCount);
  }

  getFrequencyData() {
    return this.frequencyBuffer;
  }

  getWaveformData() {
    return this.waveformBuffer;
  }

  getPackedTextureData() {
    return this.packedBuffer;
  }
}
