// BAKERY ERP - Hash de senhas com Argon2id (@noble/hashes, puro JS)
// Formato armazenado: argon2id$m=<KiB>$t=<iter>$p=<par>$<saltHex>$<hashHex>

import { argon2id } from '@noble/hashes/argon2.js'
import { randomBytes, timingSafeEqual } from 'crypto'

const TIME_COST = 3 // iterações
const MEMORY_KIB = 65536 // 64 MiB
const PARALLELISM = 1
const SALT_BYTES = 16
const KEY_LEN = 32

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

/** Gera o hash seguro (Argon2id) de uma senha em texto puro. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const derived = argon2id(password.normalize('NFKC'), salt, {
    t: TIME_COST,
    m: MEMORY_KIB,
    p: PARALLELISM,
    dkLen: KEY_LEN,
    maxmem: 256 * 1024 * 1024,
  })
  return `argon2id$m=${MEMORY_KIB}$t=${TIME_COST}$p=${PARALLELISM}$${toHex(salt)}$${toHex(derived)}`
}

/** Verifica uma senha contra o hash armazenado (tempo constante). */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'argon2id') return false
    const [, mPart, tPart, pPart, saltHex, hashHex] = parts
    const m = Number(mPart.slice(2))
    const t = Number(tPart.slice(2))
    const p = Number(pPart.slice(2))
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const derived = argon2id(password.normalize('NFKC'), salt, {
      t,
      m,
      p,
      dkLen: expected.length,
      maxmem: 256 * 1024 * 1024,
    })
    return derived.length === expected.length && timingSafeEqual(new Uint8Array(derived), new Uint8Array(expected))
  } catch {
    return false
  }
}

/** Política de senha mínima do ERP. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres'
  if (!/[a-zA-Z]/.test(password)) return 'A senha deve conter letras'
  if (!/[0-9]/.test(password)) return 'A senha deve conter números'
  return null
}
