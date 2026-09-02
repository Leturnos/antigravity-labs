import { GLSLPreprocessor } from './glsl-preprocessor.js';
import { GLSLErrorParser } from './glsl-error-parser.js';

export class ShaderEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas ? canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' }) : null;

    this.currentProgram = null;
    this.lastValidProgram = null;
    this.quadVAO = null;

    this.isRunning = false;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    this.elapsedTime = 0.0;
    this.frameIndex = 0;
    this.timeScale = 1.0;
    this.resolutionScale = 1.0;

    this.mouseCoords = [0, 0, -1, -1]; // [x, y, clickX, clickY] (click <= 0 indicates mouse up in Shadertoy)
    this.onFrameCallback = null;
    this.onErrorCallback = null;

    this.noiseTexture = null;
    this.audioTexture = null;

    if (this.gl) {
      this.initQuad();
      this.initNoiseTexture();
    }
  }

  initQuad() {
    const gl = this.gl;
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  initNoiseTexture() {
    const gl = this.gl;
    this.noiseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);

    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  setAudioTexture(audioTexture) {
    this.audioTexture = audioTexture;
  }

  onFrame(callback) {
    this.onFrameCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  compileShader(userCode) {
    if (!this.gl) return { success: false, errors: ['No WebGL2 context'] };
    const gl = this.gl;

    const { fullSource, headerLineCount } = GLSLPreprocessor.wrap(userCode);

    // Compile Vertex Shader
    const vsSource = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    // Compile Fragment Shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fullSource);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const errorLog = gl.getShaderInfoLog(fs);
      const parsedErrors = GLSLErrorParser.parse(errorLog, headerLineCount);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (this.onErrorCallback) this.onErrorCallback(parsedErrors);
      return { success: false, errors: parsedErrors };
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const errors = [{ line: 1, column: 1, message: log }];
      if (this.onErrorCallback) this.onErrorCallback(errors);
      return { success: false, errors };
    }

    if (this.lastValidProgram && this.lastValidProgram !== program) {
      gl.deleteProgram(this.lastValidProgram);
    }

    this.lastValidProgram = program;
    this.currentProgram = program;
    if (this.onErrorCallback) this.onErrorCallback([]);
    return { success: true };
  }

  updateMouse(x, y, isClicking) {
    this.mouseCoords[0] = x;
    this.mouseCoords[1] = y;
    if (isClicking) {
      this.mouseCoords[2] = Math.abs(x) || 1.0;
      this.mouseCoords[3] = Math.abs(y) || 1.0;
    } else {
      // Shadertoy standard: when mouse is released, iMouse.z is <= 0.0
      this.mouseCoords[2] = -Math.abs(this.mouseCoords[2] || 1.0);
      this.mouseCoords[3] = -Math.abs(this.mouseCoords[3] || 1.0);
    }
  }

  resetTime() {
    this.elapsedTime = 0.0;
    this.frameIndex = 0;
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
  }

  setResolutionScale(scale) {
    this.resolutionScale = Math.max(0.25, Math.min(2.0, scale));
    this.resize();
  }

  resize() {
    if (!this.canvas) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const baseW = this.canvas.clientWidth ?? this.canvas.width ?? 0;
    const baseH = this.canvas.clientHeight ?? this.canvas.height ?? 0;
    const width = Math.floor(baseW * dpr * this.resolutionScale);
    const height = Math.floor(baseH * dpr * this.resolutionScale);

    if (width > 0 && height > 0 && (this.canvas.width !== width || this.canvas.height !== height)) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  start() {
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(() => cb(performance.now()), 16);

    const renderLoop = (now) => {
      if (!this.isRunning) return;
      const dt = (now - this.lastFrameTime) / 1000.0;
      this.lastFrameTime = now;
      this.elapsedTime += dt * this.timeScale;
      this.frameIndex++;

      this.render(dt);

      if (this.onFrameCallback) {
        this.onFrameCallback({
          time: this.elapsedTime,
          deltaTime: dt,
          frame: this.frameIndex,
          width: this.canvas ? this.canvas.width : 0,
          height: this.canvas ? this.canvas.height : 0
        });
      }

      raf(renderLoop);
    };
    raf(renderLoop);
  }

  stop() {
    this.isRunning = false;
  }

  render(dt = 0.016) {
    if (!this.gl || !this.currentProgram) return;
    const gl = this.gl;
    this.resize();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.currentProgram);

    // Uniforms
    const uResolution = gl.getUniformLocation(this.currentProgram, 'iResolution');
    if (uResolution) {
      gl.uniform3f(uResolution, this.canvas.width, this.canvas.height, this.canvas.width / this.canvas.height);
    }

    const uTime = gl.getUniformLocation(this.currentProgram, 'iTime');
    if (uTime) gl.uniform1f(uTime, this.elapsedTime);

    const uTimeDelta = gl.getUniformLocation(this.currentProgram, 'iTimeDelta');
    if (uTimeDelta) gl.uniform1f(uTimeDelta, dt);

    const uFrame = gl.getUniformLocation(this.currentProgram, 'iFrame');
    if (uFrame) gl.uniform1i(uFrame, this.frameIndex);

    const uMouse = gl.getUniformLocation(this.currentProgram, 'iMouse');
    if (uMouse) {
      gl.uniform4f(uMouse, this.mouseCoords[0], this.canvas.height - this.mouseCoords[1], this.mouseCoords[2], this.mouseCoords[3]);
    }

    const uDate = gl.getUniformLocation(this.currentProgram, 'iDate');
    if (uDate) {
      const now = new Date();
      gl.uniform4f(uDate, now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    }

    // Audio Texture (iChannel0)
    if (this.audioTexture) {
      this.audioTexture.bind(0);
      const uChannel0 = gl.getUniformLocation(this.currentProgram, 'iChannel0');
      if (uChannel0) gl.uniform1i(uChannel0, 0);
    }

    // Noise Texture (iChannel1)
    if (this.noiseTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
      const uChannel1 = gl.getUniformLocation(this.currentProgram, 'iChannel1');
      if (uChannel1) gl.uniform1i(uChannel1, 1);
    }

    // Draw Quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
