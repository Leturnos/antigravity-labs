export class GLSLErrorParser {
  /**
   * Parses driver compilation logs and offsets line numbers according to the injected header.
   * Matches common formats:
   * ERROR: 0:LINE: MESSAGE
   * 0:LINE(COL): error: MESSAGE
   */
  static parse(errorLog, headerLineCount = 0) {
    if (!errorLog || typeof errorLog !== 'string') return [];

    const lines = errorLog.split('\n');
    const parsedErrors = [];

    const regexStandard = /ERROR:\s*(\d+):(\d+):\s*(.*)/i;
    const regexAngle = /(\d+):(\d+)(?:\((\d+)\))?:\s*(?:error|warning)?:\s*(.*)/i;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      let match = trimmed.match(regexStandard);
      if (match) {
        const rawLineNum = parseInt(match[2], 10);
        const userLine = Math.max(1, rawLineNum - headerLineCount);
        parsedErrors.push({
          line: userLine,
          column: 1,
          message: match[3].trim(),
          raw: trimmed
        });
        continue;
      }

      match = trimmed.match(regexAngle);
      if (match) {
        const rawLineNum = parseInt(match[2], 10);
        const colNum = match[3] ? parseInt(match[3], 10) : 1;
        const userLine = Math.max(1, rawLineNum - headerLineCount);
        parsedErrors.push({
          line: userLine,
          column: colNum,
          message: match[4] ? match[4].trim() : trimmed,
          raw: trimmed
        });
      }
    }

    return parsedErrors;
  }
}
