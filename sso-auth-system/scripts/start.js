import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import process from 'process';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerManager {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.authProcess = null;
  }

  async start() {
    console.log('🚀 Starting SSO Authentication Server...');
    console.log('Press Ctrl+C to stop\n');
    
    try {
      await this.startAuthServer();
      this.setupGracefulShutdown();
      process.stdin.resume();
    } catch (error) {
      console.error('❌ Startup error:', error.message);
      process.exit(1);
    }
  }

  async startAuthServer() {
    return new Promise((resolve, reject) => {
      this.authProcess = spawn('node', ['auth-server/server.js'], {
        stdio: 'inherit',
        cwd: this.projectRoot
      });

      this.authProcess.on('error', (error) => {
        console.error('❌ Server error:', error.message);
        reject(error);
      });

      this.authProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ Server exited with code ${code}`);
        }
        process.exit(code);
      });

      setTimeout(() => {
        console.log('✅ Server started successfully');
        resolve();
      }, 2000);
    });
  }

  setupGracefulShutdown() {
    const shutdown = (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down...`);
      
      if (this.authProcess) {
        this.authProcess.kill('SIGTERM');
        
        setTimeout(() => {
          if (this.authProcess && !this.authProcess.killed) {
            this.authProcess.kill('SIGKILL');
          }
          console.log('✅ Server stopped');
          process.exit(0);
        }, 2000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    if (process.platform === 'win32') {
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        rl.on('SIGINT', () => {
          process.emit('SIGINT');
        });
      }).catch(console.error);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manager = new ServerManager();
  manager.start().catch(console.error);
}

export default ServerManager;