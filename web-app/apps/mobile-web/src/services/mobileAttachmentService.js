import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { ensureFirebase, waitForFirebaseAuthReady } from '../firebase/firebaseClient'

function toText(value) {
  return String(value ?? '').trim()
}

function toSafePathToken(value, fallback = 'na') {
  const normalized = toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function fileExtensionFromMime(mimeType) {
  const mime = toText(mimeType).toLowerCase()
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return 'jpg'
}

function toBlob(value) {
  if (value instanceof Blob) return value
  return null
}

function uploadErrorMessage(error) {
  const code = toText(error?.code).toLowerCase()
  const message = toText(error?.message)
  if (code.includes('storage/unauthorized')) {
    return 'Brak uprawnień do zapisu zdjęć w Storage.'
  }
  if (code.includes('storage/retry-limit-exceeded')) {
    return 'Przekroczono limit ponowień uploadu zdjęć.'
  }
  if (code.includes('storage/canceled')) {
    return 'Upload zdjęcia został anulowany.'
  }
  return message || 'Nie udało się zapisać zdjęcia.'
}

export async function uploadClosureAttachments({
  session,
  scope,
  workdayId,
  cycleId,
  workerLogin,
  attachments,
}) {
  const firebase = ensureFirebase()
  if (!firebase?.storage) {
    throw new Error('Brak dostępu do Firebase Storage.')
  }

  await waitForFirebaseAuthReady()

  const orgId = toText(session?.orgId)
  const createdByUid = toText(session?.uid)
  if (!orgId) {
    throw new Error('Brak orgId do zapisu załączników.')
  }

  if (!createdByUid) {
    throw new Error('Brak UID uzytkownika do zapisu zalacznikow.')
  }

  const attachmentList = Array.isArray(attachments) ? attachments : []
  if (!attachmentList.length) {
    return { uploaded: [], failed: [] }
  }

  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const safeScope = toSafePathToken(scope || 'zone-close')
  const safeWorkerLogin = toSafePathToken(workerLogin || session?.workerLogin || session?.login || session?.email, 'worker')
  const keyId = toSafePathToken(workdayId || cycleId || `unknown-${Date.now()}`)
  const basePath = `orgs/${toSafePathToken(orgId)}/mobile-closures/${safeScope}/${year}/${month}/${safeWorkerLogin}/${keyId}`

  const uploaded = []
  const failed = []

  for (let index = 0; index < attachmentList.length; index += 1) {
    const item = attachmentList[index]
    const blob = toBlob(item?.blob)
    const mimeType = toText(item?.mimeType || blob?.type || 'image/jpeg') || 'image/jpeg'
    const ext = fileExtensionFromMime(mimeType)
    const attachmentId = toSafePathToken(item?.id, `att-${index + 1}`)
    const storagePath = `${basePath}/${attachmentId}.${ext}`

    if (!blob) {
      failed.push({
        id: attachmentId,
        message: 'Brak danych pliku do uploadu.',
      })
      continue
    }

    try {
      const storageRef = ref(firebase.storage, storagePath)
      await uploadBytes(storageRef, blob, {
        contentType: mimeType,
        customMetadata: {
          scope: safeScope,
          orgId: toSafePathToken(orgId),
          workerLogin: safeWorkerLogin,
          createdByUid,
          source: 'mobile-web',
        },
      })
      const downloadUrl = await getDownloadURL(storageRef)
      uploaded.push({
        id: attachmentId,
        storagePath,
        downloadUrl,
        contentType: mimeType,
        sizeBytes: Number.isFinite(Number(item?.sizeBytes)) ? Number(item.sizeBytes) : blob.size,
        width: Number.isFinite(Number(item?.width)) ? Number(item.width) : null,
        height: Number.isFinite(Number(item?.height)) ? Number(item.height) : null,
        capturedAtIso: toText(item?.capturedAtIso) || null,
        uploadedAtIso: new Date().toISOString(),
      })
    } catch (error) {
      failed.push({
        id: attachmentId,
        message: uploadErrorMessage(error),
      })
    }
  }

  return { uploaded, failed }
}
