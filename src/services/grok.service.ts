// Grok Pattern Debugger Service
// Pure TypeScript implementation - no external dependencies

// Built-in Grok patterns (subset of common patterns)
const BUILTIN_PATTERNS: Record<string, string> = {
  USERNAME: "[a-zA-Z0-9._-]+",
  USER: "%{USERNAME}",
  EMAILLOCALPART: "[a-zA-Z0-9._%+-]+",
  EMAILADDRESS: "%{EMAILLOCALPART}@%{HOSTNAME}",
  INT: "(?:[+-]?(?:[0-9]+))",
  BASE10NUM: "(?<![0-9.+-])(?>[+-]?(?:(?:[0-9]+(?:\\.[0-9]+)?)|(?:\\.[0-9]+)))(?![0-9.+-])",
  BASE16NUM: "0x[0-9a-fA-F]+",
  NUMBER: "(?:%{BASE10NUM}|%{BASE16NUM})",
  POSINT: "\\b(?:[1-9][0-9]*)\\b",
  NONNEGINT: "\\b(?:[0-9]+)\\b",
  WORD: "\\S+",
  NOTSPACE: "\\S+",
  DATA: ".*",
  GREEDYDATA: ".*",
  QUOTEDSTRING: "(?:\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
  UUID: "[A-Fa-f0-9]{8}-(?:[A-Fa-f0-9]{4}-){3}[A-Fa-f0-9]{12}",
  MAC: "(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}",
  IP: "(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)",
  HOSTNAME: "\\b(?:[0-9A-Za-z][0-9A-Za-z-]{0,62})(?:\\.(?:[0-9A-Za-z][0-9A-Za-z-]{0,62}))*(\\.?\\b)",
  IPORHOST: "(?:%{IP}|%{HOSTNAME})",
  HOSTPORT: "%{IPORHOST}:%{POSINT}",
  PATH: "(?:[\\w\\d\\._/-]+)+(?:/(?:[\\w\\d\\._/-]+)*)*",
  URIPATH: "(?:/[\\w\\d\\._~:@!$&'()*+,;=\\-]+)+",
  URIPATHPARAM: "%{URIPATH}(?:\\?%{NOTSPACE})?",
  URI: "%{URIPATHPARAM}|%{URIPROTO}://%{IPORHOST}(?::%{POSINT})?%{URIPATHPARAM}?",
  URIPROTO: "[a-zA-Z]+(?=://)",
  URIPORT: "(?::%{POSINT})",
  TIMESTAMP_ISO8601: "%{YEAR}-%{MONTHNUM}-%{MONTHDAY}[T ]%{TIME}",
  TIMESTAMP_HH_MM_SS: "%{TIME}",
  TIMESTAMP_MONTH_DAY: "%{MONTHNUM}-%{MONTHDAY}",
  TIMESTAMP_YEAR: "%{YEAR}",
  TIMESTAMP_TIMEZONE: "(?:GMT)?[+-]\\d{4}",
  TIME: "%{HOUR}:%{MINUTE}(?::%{SECOND})?%{TIMESTAMP_TIMEZONE}?",
  HOUR: "(?:2[0123]|[01]?[0-9])",
  MINUTE: "(?:[0-5][0-9])",
  SECOND: "(?:(?:[0-5]?[0-9]|60)(?:[.,][0-9]+)?)",
  MONTHDAY: "(?:(?:0[1-9])|(?:[12][0-9])|(?:3[01])|[1-9])",
  MONTH: "(?:0?[1-9]|1[0-2])",
  YEAR: "(?!\\d)[0-9]{4}",
  DATE: "%{MONTHNUM}[/-]%{MONTHDAY}[/-]%{YEAR}",
  DATE_US: "%{MONTHNUM}[/-]%{MONTHDAY}[/-]%{YEAR}",
  DATE_EU: "%{MONTHDAY}[./-]%{MONTHNUM}[./-]%{YEAR}",
  SYSLOGTIMESTAMP: "%{MONTH} +%{MONTHDAY} %{TIME}",
  SYSLOGFACILITY: "<%%{NONNEGINT}>",
  SYSLOGPROG: "\\S+",
  SYSLOGHOST: "%{IPORHOST}",
  SYSLOGDATE: "%{SYSLOGTIMESTAMP}|%{TIMESTAMP_ISO8601}",
  SYSLOG: "%{SYSLOGDATE} %{SYSLOGHOST} %{SYSLOGPROG}(?:\\[%{POSINT}\\])?:",
  COMBINEDAPACHELOG: "%{IPORHOST} - %{USER} \\[%{HTTPDATE}\\] \"%{WORD} %{URIPATHPARAM}?%{URIPROTO}? %{DATA}\" %{NUMBER:bytes:int} %{NUMBER:duration:int} \\[.*\\] \"%{DATA}\" \"%{DATA}\"",
  HTTPDATE: "%{MONTHDAY}/%{MONTH}/%{YEAR}:%{TIME} %{INT}",
  LOGLEVEL: "emerg|alert|crit|error|warning|notice|info|debug|warn|err|fatal|trace|panic|Informational|Unknown",
};

interface GrokMatchResult {
  [key: string]: string | undefined;
}

interface LineVisual {
  matched: boolean;
  empty: boolean;
  text: string;
  match_data?: GrokMatchResult;
}

interface GrokTestResult {
  lines_visual: LineVisual[];
  json_output: { line: number; data: GrokMatchResult }[];
}

export class GrokService {
  private patterns: Record<string, string>;

  constructor() {
    this.patterns = { ...BUILTIN_PATTERNS };
  }

  private parseCustomPatternsInto(target: Record<string, string>, customPatternsStr: string): void {
    if (!customPatternsStr) return;
    for (const line of customPatternsStr.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0];
          const regex = parts.slice(1).join(" ");
          target[name] = regex;
        }
      }
    }
  }

  private expandPattern(pattern: string, patterns: Record<string, string>): string {
    const cache = new Map<string, string>();

    const expand = (name: string, depth: number): string => {
      if (depth > 50) return "";
      if (cache.has(name)) return cache.get(name)!;

      let regex = patterns[name];
      if (!regex) return "";

      cache.set(name, "");

      regex = regex.replace(/%\{([^:}]+)(?::([^}]+))?\}/g, (_match, patternName, _fieldName) => {
        return expand(patternName, depth + 1);
      });

      cache.set(name, regex);
      return regex;
    };

    let expanded = pattern;
    let lastExpanded = "";
    let iterations = 0;

    while (expanded !== lastExpanded && iterations < 100) {
      lastExpanded = expanded;
      iterations++;

      expanded = expanded.replace(/%\{([^:}]+)(?::([^}]+))?\}/g, (_match, patternName, _fieldName) => {
        const regex = expand(patternName, 0);
        return regex || _match;
      });
    }

    return expanded;
  }

  private buildRegex(pattern: string, patterns: Record<string, string>): { regex: RegExp; fieldNames: string[] } {
    const fieldNames: string[] = [];
    let regexStr = pattern;

    regexStr = regexStr.replace(/%\{([^:}]+):([^}]+)\}/g, (_match, patternName, fieldName) => {
      fieldNames.push(fieldName);
      const expanded = patterns[patternName] || "";
      if (!expanded) return "";
      return `(?<${fieldName}>${expanded})`;
    });

    // Second pass: expand remaining %{PATTERN} (without name)
    regexStr = regexStr.replace(/%\{([^:}]+)\}/g, (_match, patternName) => {
      const expanded = patterns[patternName] || "";
      return expanded;
    });

    try {
      const regex = new RegExp(`^${regexStr}$`, "s");
      return { regex, fieldNames };
    } catch (e) {
      throw new Error(`Invalid regex after pattern expansion: ${regexStr}`);
    }
  }

  public testGrok(pattern: string, customPatterns: string, rawLog: string): GrokTestResult {
    const localPatterns: Record<string, string> = { ...BUILTIN_PATTERNS };
    this.parseCustomPatternsInto(localPatterns, customPatterns);

    const lines = rawLog.split("\n");
    const resultLines: LineVisual[] = [];
    const jsonOutput: { line: number; data: GrokMatchResult }[] = [];

    let regex: RegExp | null = null;
    try {
      const expandedPattern = this.expandPattern(pattern, localPatterns);
      const built = this.buildRegex(expandedPattern, localPatterns);
      regex = built.regex;
    } catch (e: any) {
      throw new Error(`Pattern error: ${e.message}`);
    }

    for (let i = 0; i < lines.length && i < 10000; i++) {
      const line = lines[i];

      if (!line.trim()) {
        resultLines.push({ matched: false, empty: true, text: line });
        continue;
      }

      if (!regex) {
        resultLines.push({ matched: false, empty: false, text: line });
        continue;
      }

      let match: RegExpExecArray | null = null;
      try {
        match = regex.exec(line);
      } catch (_e) {
        resultLines.push({ matched: false, empty: false, text: line });
        continue;
      }

      if (match && match.groups) {
        const cleanMatch: GrokMatchResult = {};
        for (const [key, value] of Object.entries(match.groups)) {
          if (value !== undefined && value !== "") {
            cleanMatch[key] = value;
          }
        }

        if (Object.keys(cleanMatch).length > 0) {
          jsonOutput.push({ line: i + 1, data: cleanMatch });
          resultLines.push({ matched: true, empty: false, text: line, match_data: cleanMatch });
        } else {
          resultLines.push({ matched: false, empty: false, text: line });
        }
      } else {
        resultLines.push({ matched: false, empty: false, text: line });
      }
    }

    return {
      lines_visual: resultLines,
      json_output: jsonOutput,
    };
  }
}

export const grokService = new GrokService();
