import 'dotenv/config'
import path from 'path'

const dataDir = process.env.DATA_DIR || '/data'

// Single upload/import limits. LubeLogger appdata folders (photos, documents,
// database) routinely exceed 50MB, so defaults are generous and tunable.
const maxUploadBytes = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '1024', 10) * 1024 * 1024
const maxImportFiles = parseInt(process.env.MAX_IMPORT_FILES || '100000', 10)

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  dataDir,
  dbPath: path.join(dataDir, 'milemarker.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  isProd: process.env.NODE_ENV === 'production',
  maxUploadBytes,
  maxImportFiles,
}
