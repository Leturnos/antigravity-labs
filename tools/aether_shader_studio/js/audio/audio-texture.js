export class AudioTexture {
  constructor(gl) {
    this.gl = gl;
    this.texture = gl.createTexture();
    this.width = 512;
    this.height = 2;

    this.initTexture();
  }

  initTexture() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initialize with 1024 bytes (512x2 R8 format)
    const initialData = new Uint8Array(this.width * this.height);
    initialData.fill(0, 0, 512); // FFT row 0
    initialData.fill(128, 512, 1024); // Waveform row 1

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      this.width,
      this.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      initialData
    );
  }

  update(packedData) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width,
      this.height,
      gl.RED,
      gl.UNSIGNED_BYTE,
      packedData
    );
  }

  bind(textureUnit = 0) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
  }
}
