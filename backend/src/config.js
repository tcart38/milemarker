import 'dotenv/config'
import path from 'path'

const dataDir = process.env.DATA_DIR || '/data'

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  dataDir,
  dbPath: path.join(dataDir, 'milemarker.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  isProd: process.env.NODE_ENV === 'production',
}
