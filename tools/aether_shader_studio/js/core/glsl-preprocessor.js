export class GLSLPreprocessor {
  static getHeader() {
    return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

out vec4 fragColorOutput;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
`;
  }

  static getFooter() {
    return `
void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    mainImage(color, gl_FragCoord.xy);
    fragColorOutput = color;
}
`;
  }

  static wrap(userCode) {
    const header = this.getHeader();
    const footer = this.getFooter();
    const headerLines = header.split('\n');
    const headerLineCount = headerLines.length - 1;

    const fullSource = `${header}${userCode}${footer}`;
    return { fullSource, headerLineCount };
  }
}
