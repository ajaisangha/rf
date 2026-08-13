const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return window.btoa(binary)
}

const fromBase64 = (base64) => {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const getEncryptionKey = async () => {
  const passphrase = import.meta.env.VITE_RF_TRACKER_ENCRYPTION_KEY

  if (!passphrase) {
    throw new Error(
      'Missing encryption key. Add VITE_RF_TRACKER_ENCRYPTION_KEY to your .env file.'
    )
  }

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('rf-tracker-employee-data-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

export const encryptEmployee = async (employee) => {
  const key = await getEncryptionKey()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))

  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(JSON.stringify(employee))
  )

  return {
    encryptedData: toBase64(encryptedData),
    iv: toBase64(iv),
  }
}

export const decryptEmployee = async ({ encryptedData, iv }) => {
  const key = await getEncryptionKey()

  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(iv),
    },
    key,
    fromBase64(encryptedData)
  )

  return JSON.parse(decoder.decode(decryptedData))
}