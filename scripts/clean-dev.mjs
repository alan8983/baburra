#!/usr/bin/env node
/**
 * clean-dev.js
 * 
 * 防止 "unable to acquire lock" 錯誤的清理腳本
 * 在 npm run dev 之前自動執行
 * 
 * 功能：
 * 1. 檢查並終止佔用 port 3000 的孤兒程序
 * 2. 刪除殘留的 .next/dev/lock 檔案
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const LOCK_FILE = path.join(__dirname, '..', '.next', 'dev', 'lock');

console.log('🧹 Running pre-dev cleanup...\n');

// Step 1: Check and kill process using port 3000
function killPortProcess() {
  try {
    // Windows: Use netstat to find PID
    const result = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse PID from netstat output (last column)
    const lines = result.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(parseInt(pid))) {
        pids.add(pid);
      }
    }

    if (pids.size > 0) {
      for (const pid of pids) {
        try {
          console.log(`⚠️  Found process ${pid} using port ${PORT}`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
          console.log(`✅ Killed process ${pid}`);
        } catch {
          // Process might have already exited
          console.log(`ℹ️  Process ${pid} already terminated or access denied`);
        }
      }
    } else {
      console.log(`✅ Port ${PORT} is free`);
    }
  } catch {
    // No process found on port - this is fine
    console.log(`✅ Port ${PORT} is free`);
  }
}

// Step 2: Remove stale lock file
function removeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      console.log('✅ Removed stale lock file: .next/dev/lock');
    } else {
      console.log('✅ No stale lock file found');
    }
  } catch (err) {
    console.log(`⚠️  Could not remove lock file: ${err.message}`);
  }
}

// Execute cleanup
killPortProcess();
removeLockFile();

console.log('\n🚀 Cleanup complete. Starting dev server...\n');
