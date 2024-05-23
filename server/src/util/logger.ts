/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
 * c/o Linköpings universitet, Department of Computer and Information Science,
 * SE-58183 Linköping, Sweden.
 *
 * All rights reserved.
 *
 * THIS PROGRAM IS PROVIDED UNDER THE TERMS OF AGPL VERSION 3 LICENSE OR
 * THIS OSMC PUBLIC LICENSE (OSMC-PL) VERSION 1.8.
 * ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS PROGRAM CONSTITUTES
 * RECIPIENT'S ACCEPTANCE OF THE OSMC PUBLIC LICENSE OR THE GNU AGPL
 * VERSION 3, ACCORDING TO RECIPIENTS CHOICE.
 *
 * The OpenModelica software and the OSMC (Open Source Modelica Consortium)
 * Public License (OSMC-PL) are obtained from OSMC, either from the above
 * address, from the URLs:
 * http://www.openmodelica.org or
 * https://github.com/OpenModelica/ or
 * http://www.ida.liu.se/projects/OpenModelica,
 * and in the OpenModelica distribution.
 *
 * GNU AGPL version 3 is obtained from:
 * https://www.gnu.org/licenses/licenses.html#GPL
 *
 * This program is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE, EXCEPT AS EXPRESSLY SET FORTH
 * IN THE BY RECIPIENT SELECTED SUBSIDIARY LICENSE CONDITIONS OF OSMC-PL.
 *
 * See the full OSMC Public License conditions for more details.
 *
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

export type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_LEVELS_TO_MESSAGE_TYPES: {
  [logLevel in LogLevel]: LSP.MessageType;
} = {
  debug: LSP.MessageType.Debug,
  log: LSP.MessageType.Log,
  info: LSP.MessageType.Info,
  warning: LSP.MessageType.Warning,
  error: LSP.MessageType.Error,
} as const;

export interface LoggerOptions {
  /**
   * The connection to the LSP client. If unset, will not log to the client.
   *
   * Default: `null`
   */
  connection?: LSP.Connection | null;
  /**
   * The minimum log level.
   *
   * Default: use the environment variable {@link LOG_LEVEL_ENV_VAR}, or {@link DEFAULT_LOG_LEVEL} if unset.
   */
  logLevel?: LogLevel;
  /**
   * `true` to log locally as well as to the LSP client.
   *
   * Default: `false`
   */
  useLocalLogging?: boolean;
}

// Singleton madness to allow for logging from anywhere in the codebase
let _options: LoggerOptions = {};

/**
 * Sets the logger options. Should be done at startup.
 */
export function setLoggerOptions(options: LoggerOptions) {
  _options = options;
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
    [LSP.MessageType.Debug]: 'DEBUG',
  };

  static MESSAGE_TYPE_TO_LOG_FUNCTION: Record<LSP.MessageType, (msg: string) => void> = {
    [LSP.MessageType.Error]: console.error,
    [LSP.MessageType.Warning]: console.warn,
    [LSP.MessageType.Info]: console.info,
    [LSP.MessageType.Log]: console.log,
    [LSP.MessageType.Debug]: console.debug,
  };

  public log(severity: LSP.MessageType, messageObjects: any[]) {
    const logLevelString = _options.logLevel ?? getLogLevelFromEnvironment();
    const logLevel = LOG_LEVELS_TO_MESSAGE_TYPES[logLevelString];
    if (logLevel < severity) {
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

    if (_options.connection) {
      _options.connection.sendNotification(LSP.LogMessageNotification.type, {
        type: severity,
        message,
      });
    }

    if (_options.useLocalLogging) {
      const log = Logger.MESSAGE_TYPE_TO_LOG_FUNCTION[logLevel];
      log(message);
    }
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
function getLogLevelFromEnvironment(): LogLevel {
  const logLevel = process.env[LOG_LEVEL_ENV_VAR];
  if (logLevel) {
    if (logLevel in LOG_LEVELS_TO_MESSAGE_TYPES) {
      return logLevel as LogLevel;
    }
    // eslint-disable-next-line no-console
    console.warn(
      `Invalid ${LOG_LEVEL_ENV_VAR} "${logLevel}", expected one of: ${Object.keys(
        LOG_LEVELS_TO_MESSAGE_TYPES,
      ).join(', ')}`,
    );
  }

  return DEFAULT_LOG_LEVEL;
}
