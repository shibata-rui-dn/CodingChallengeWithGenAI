import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from '../../config/configLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = getConfig();

const projectRoot = path.resolve(__dirname, '..', '..');

const logsDir = path.join(projectRoot, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.isAbsolute(config.logging.file) 
  ? config.logging.file 
  : path.join(projectRoot, config.logging.file.replace(/^./, ''));

const errorLogPath = path.join(path.dirname(logFilePath), 'error.log');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sso-auth-server' },
  transports: [
    new winston.transports.File({ 
      filename: errorLogPath,
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: logFilePath
    })
  ]
});

if (process.env.NODE_ENV !== 'production' && config.logging.console) {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;