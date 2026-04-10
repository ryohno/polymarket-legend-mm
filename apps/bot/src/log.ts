/**
 * Structured logger (pino) with key-material redaction.
 *
 * Never log:
 *   - privateKey, mnemonic
 *   - CLOB API secret/passphrase
 *   - KEYSTORE_PASSWORD
 *
 * When the TUI is active (TUI env var is not "false"), logs go to
 * `data/bot.log` instead of stdout so they don't clobber the dashboard.
 * Tail that file in a second terminal with `tail -f data/bot.log`.
 */

import pino from 'pino'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const tuiOn = process.env.TUI !== 'false'
const logFile = 'data/bot.log'

// Make sure data/ exists before pino tries to open the file
try {
  mkdirSync('data', { recursive: true })
} catch {
  // ignore
}

const redact = {
  paths: [
    'privateKey',
    '*.privateKey',
    'mnemonic',
    '*.mnemonic',
    'secret',
    '*.secret',
    'passphrase',
    '*.passphrase',
    'password',
    '*.password',
    'KEYSTORE_PASSWORD',
    'creds.secret',
    'creds.passphrase',
  ],
  censor: '[REDACTED]',
}

export const logger = tuiOn
  ? pino(
      { level: process.env.LOG_LEVEL ?? 'info', redact },
      pino.destination({ dest: resolve(process.cwd(), logFile), sync: false })
    )
  : pino({
      level: process.env.LOG_LEVEL ?? 'info',
      redact,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
    })

export const LOG_FILE_PATH = logFile
