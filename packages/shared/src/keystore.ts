/**
 * Local encrypted keystore for wallet private keys.
 *
 * Format: JSON file with scrypt-derived key + AES-256-GCM-encrypted payload.
 * Inspired by (but not compatible with) the Ethereum V3 keystore format. We
 * don't need Ethereum compatibility — this is a local bot keystore, and the
 * simpler format is less footgun-prone.
 *
 * The raw private key hex is NEVER written to disk. It lives in memory only
 * during signing operations.
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const SCRYPT_N = 1 << 17 // 131072, OWASP current recommendation for scrypt
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 16
const IV_LEN = 12 // GCM standard

export interface KeystoreFile {
  version: 1
  label: string
  address: `0x${string}`
  createdAt: number
  kdf: 'scrypt'
  kdfParams: { N: number; r: number; p: number; saltHex: string }
  cipher: 'aes-256-gcm'
  ciphertextHex: string
  ivHex: string
  authTagHex: string
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 })
}

export function encryptKeystore(params: {
  privateKey: `0x${string}`
  address: `0x${string}`
  password: string
  label: string
}): KeystoreFile {
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = deriveKey(params.password, salt)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(params.privateKey.slice(2), 'hex')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    version: 1,
    label: params.label,
    address: params.address,
    createdAt: Date.now(),
    kdf: 'scrypt',
    kdfParams: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, saltHex: salt.toString('hex') },
    cipher: 'aes-256-gcm',
    ciphertextHex: ciphertext.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
  }
}

export function decryptKeystore(file: KeystoreFile, password: string): `0x${string}` {
  if (file.version !== 1) throw new Error(`Unsupported keystore version: ${file.version}`)
  const salt = Buffer.from(file.kdfParams.saltHex, 'hex')
  const iv = Buffer.from(file.ivHex, 'hex')
  const authTag = Buffer.from(file.authTagHex, 'hex')
  const ciphertext = Buffer.from(file.ciphertextHex, 'hex')
  const key = deriveKey(password, salt)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return `0x${plaintext.toString('hex')}` as `0x${string}`
  } catch {
    throw new Error('Failed to decrypt keystore — wrong password?')
  }
}

export function saveKeystore(path: string, file: KeystoreFile): void {
  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true })
  }
  writeFileSync(path, JSON.stringify(file, null, 2), { mode: 0o600 })
}

export function loadKeystore(path: string): KeystoreFile {
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as KeystoreFile
}
