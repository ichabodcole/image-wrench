import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

const defaultLevel = import.meta.env.DEV ? 'debug' : 'info';

export class Logger {
  private static baseLogger: PinoLogger;

  // Initialize the base logger with default options
  static initialize(options?: LoggerOptions) {
    this.baseLogger = pino({
      level: defaultLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: true,
        },
      },
      ...options,
    });
  }

  // Get a child logger instance with component name
  static getLogger(component: string): PinoLogger {
    if (!this.baseLogger) {
      this.initialize();
    }

    return this.baseLogger.child({ component });
  }

  // Utility method to change the log level of the base logger
  static setLevel(level: string) {
    if (!this.baseLogger) {
      this.initialize();
    }
    this.baseLogger.level = level;
  }

  // Utility method to enable/disable logging
  static setEnabled(enabled: boolean) {
    if (!this.baseLogger) {
      this.initialize();
    }
    this.baseLogger.level = enabled ? 'info' : 'silent';
  }
}
