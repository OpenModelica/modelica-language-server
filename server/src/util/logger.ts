/*
 * This file is part of modelica-language-server.
 *
 * modelica-language-server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * modelica-language-server is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with modelica-language-server. If not, see
 * <http://www.gnu.org/licenses/>.
 */

/* -----------------------------------------------------------------------------
 * Taken from bash-language-server and adapted to Modelica language server
 * https://github.com/bash-lsp/bash-language-server/blob/main/server/src/parser.ts
 * -----------------------------------------------------------------------------
 */

import * as LSP from 'vscode-languageserver';

export const LOG_LEVEL_ENV_VAR = 'MODELICA_IDE_LOG_LEVEL';
export const LOG_LEVELS = ['debug', 'log', 'info', 'warning', 'error'] as const;
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

type LogLevel = (typeof LOG_LEVELS)[number]

const LOG_LEVELS_TO_MESSAGE_TYPES: {
  [logLevel in LogLevel]: LSP.MessageType
} = {
  debug: LSP.MessageType.Debug,
  log: LSP.MessageType.Log,
  info: LSP.MessageType.Info,
  warning: LSP.MessageType.Warning,
  error: LSP.MessageType.Error,
} as const;

// Singleton madness to allow for logging from anywhere in the codebase
let _connection: LSP.Connection | null = null;
let _logLevel: LSP.MessageType = getLogLevelFromEnvironment();

/**
 * Set the log connection. Should be done at startup.
 */
export function setLogConnection(connection: LSP.Connection) {
  _connection = connection;
}

/**
 * Set the minimum log level.
 */
export function setLogLevel(logLevel: LogLevel) {
  _logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevel];
}

export class Logger {
  private prefix: string;

  constructor({ prefix = '' }: { prefix?: string } = {}) {
    this.prefix = prefix;
  }

  static MESSAGE_TYPE_TO_LOG_LEVEL_MSG: Record<LSP.MessageType, string> = {
    [LSP.MessageType.Error]: 'ERROR ⛔️',
    [LSP.MessageType.Warning]: 'WARNING ⛔️',
    [LSP.MessageType.Info]: 'INFO',
    [LSP.MessageType.Log]: 'LOG',
    [LSP.MessageType.Debug]: 'DEBUG'
  };

  public log(severity: LSP.MessageType, messageObjects: any[]) {
    if (_logLevel < severity) {
      return;
    }

    if (!_connection) {
      // eslint-disable-next-line no-console
      console.warn(`The logger's LSP Connection is not set. Dropping messages`);
      return;
    }

    const formattedMessage = messageObjects
      .map((p) => {
        if (p instanceof Error) {
          return p.stack || p.message;
        }

        if (typeof p === 'object') {
          return JSON.stringify(p, null, 2);
        }

        return p;
      })
      .join(' ');

    const level = Logger.MESSAGE_TYPE_TO_LOG_LEVEL_MSG[severity];
    const prefix = this.prefix ? `${this.prefix} - ` : '';
    const time = new Date().toISOString().substring(11, 23);
    const message = `${time} ${level} ${prefix}${formattedMessage}`;

    _connection.sendNotification(LSP.LogMessageNotification.type, {
      type: severity,
      message,
    });
  }

  public debug(message: string, ...additionalArgs: any[]) {
    this.log(LSP.MessageType.Debug, [message, ...additionalArgs]);
  }
  public info(message: string, ...additionalArgs: any[]) {
    this.log(LSP.MessageType.Info, [message, ...additionalArgs]);
  }
  public warn(message: string, ...additionalArgs: any[]) {
    this.log(LSP.MessageType.Warning, [message, ...additionalArgs]);
  }
  public error(message: string, ...additionalArgs: any[]) {
    this.log(LSP.MessageType.Error, [message, ...additionalArgs]);
  }
}

/**
 * Default logger.
 */
export const logger = new Logger();

/**
 * Get the log level from the environment, before the server initializes.
 * Should only be used internally.
 */
export function getLogLevelFromEnvironment(): LSP.MessageType {
  const logLevelFromEnvironment = process.env[LOG_LEVEL_ENV_VAR] as LogLevel | undefined;
  if (logLevelFromEnvironment) {
    const logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevelFromEnvironment];
    if (logLevel) {
      return logLevel;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `Invalid ${LOG_LEVEL_ENV_VAR} "${logLevelFromEnvironment}", expected one of: ${Object.keys(
        LOG_LEVELS_TO_MESSAGE_TYPES,
      ).join(', ')}`,
    );
  }

  return LOG_LEVELS_TO_MESSAGE_TYPES[DEFAULT_LOG_LEVEL];
}