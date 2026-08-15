// ═══════════════════════════════════════════════════════════════
// NexusHub Encryption Utility — AES-256-CBC
// Encrypts sensitive fields (Government IDs, Bank account numbers)
// ═══════════════════════════════════════════════════════════════
import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const SECRET_SOURCE = process.env.JWT_SECRET || 'fallback-secret-key-at-least-32-chars-long'

// Derive a static 32-byte key from the secret source using SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(SECRET_SOURCE).digest()

/**
 * Encrypts cleartext using AES-256-CBC.
 * @param {string} text - Cleartext to encrypt
 * @returns {string|null} Encrypted string in format: ivHex:ciphertextHex, or null if input empty
 */
export function encrypt(text) {
  if (!text) return null
  try {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  } catch (err) {
    console.error('Encryption error:', err.message)
    return null
  }
}

/**
 * Decrypts ciphertext format: ivHex:ciphertextHex.
 * @param {string} encryptedText - Encrypted string to decrypt
 * @returns {string|null} Decrypted cleartext, or null if input empty/invalid
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return null
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText // Assume it was not encrypted if format doesn't match
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = Buffer.from(parts[1], 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.error('Decryption error:', err.message)
    return null // Return null on decryption failure to avoid returning garbage
  }
}

/**
 * Encrypts sensitive fields of an Employee object.
 * @param {object} emp - Employee data object
 * @returns {object} Encrypted copy of Employee data
 */
export function encryptEmployee(emp) {
  const result = { ...emp }
  if (result.sssNo) result.sssNo = encrypt(result.sssNo)
  if (result.tin) result.tin = encrypt(result.tin)
  if (result.philhealthNo) result.philhealthNo = encrypt(result.philhealthNo)
  if (result.hdmfNo) result.hdmfNo = encrypt(result.hdmfNo)
  if (result.bankAccountNo) result.bankAccountNo = encrypt(result.bankAccountNo)
  return result
}

/**
 * Decrypts sensitive fields of an Employee object.
 * @param {object} emp - Employee data object
 * @returns {object} Decrypted copy of Employee data
 */
export function decryptEmployee(emp) {
  if (!emp) return emp
  const result = { ...emp }
  if (result.sssNo) result.sssNo = decrypt(result.sssNo)
  if (result.tin) result.tin = decrypt(result.tin)
  if (result.philhealthNo) result.philhealthNo = decrypt(result.philhealthNo)
  if (result.hdmfNo) result.hdmfNo = decrypt(result.hdmfNo)
  if (result.bankAccountNo) result.bankAccountNo = decrypt(result.bankAccountNo)
  return result
}

