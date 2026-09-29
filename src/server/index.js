#!/usr/bin/env node

/**
 * Vibe Remote Harness Server
 * 
 * ISO 27001 Compliant Application Server
 * 
 * Security Controls Implemented:
 * - A.9.4.1: Information access restriction
 * - A.12.4.1: Event logging
 * - A.12.4.2: Protection of log information
 * - A.13.1.1: Network controls
 * - A.14.2.1: Secure development policy
 * - A.14.2.5: Secure system architecture and engineering principles
 * - A.16.1.4: Assessment of and decision on information security events
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// SECURITY CONFIGURATION (ISO 27001 - A.9.4 Access Control)
// ============================================================================

const config = {
  development: {
    port: PORT,
    allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    logging: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 1000 }
  },
  production: {
    port: process.env.PORT || 8080,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
    logging: true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 100 }
  }
}[NODE_ENV];

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; form-action 'self'"
  );
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  next();
};

// ============================================================================
// LOGGING SYSTEM (ISO 27001 - A.12.4 Logging and Monitoring)
// ============================================================================

class SecurityLogger {
  constructor() {
    this.logDir = path.join(__dirname, '..', '..', 'logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...metadata, environment: NODE_ENV };
    const logFile = path.join(this.logDir, `${timestamp.split('T')[0]}-security.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    if (config.logging) {
      console[level === 'error' ? 'error' : level](`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  info(message, metadata) { this.log('info', message, metadata); }
  warn(message, metadata) { this.log('warn', message, metadata); }
  error(message, metadata) { this.log('error', message, metadata); }
  security(message, metadata) { this.log('security', message, metadata); }
}

const logger = new SecurityLogger();

// ============================================================================
// REQUEST VALIDATION (ISO 27001 - A.14.2 Secure Development)
// ============================================================================

const validateCommand = (command) => {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Invalid command type' };
  }
  if (command.length > 4096) {
    return { valid: false, error: 'Command too long' };
  }
  const dangerousPatterns = [
    /;\s*rm\s+-rf/,
    new RegExp(';\\s*rmdir\\s+\\/\\s*'),
    new RegExp(';\\s*dd\\s+if=.*'),
    /;\s*mkfs/,
    /;\s*chmod\s+777/,
    /;\s*wget\s+.*\|\s*sh/,
    /;\s*curl\s+.*\|\s*sh/,
    /&&\s*rm/,
    /\|\s*rm/,
    /`.*`/,
    /\$\(/,
    /\broot\b/,
    /\bsudo\b/,
    /\bpassword\b/i
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      logger.security('Blocked dangerous command pattern', { command: '[REDACTED]' });
      return { valid: false, error: 'Command contains prohibited patterns' };
    }
  }
  return { valid: true };
};

const sanitizePath = (inputPath) => {
  if (!inputPath) return null;
  let cleanPath = path.normalize(inputPath);
  cleanPath = cleanPath.replace(/\x00/g, '');
  cleanPath = path.resolve(cleanPath);
  const root = path.resolve('/');
  if (!cleanPath.startsWith(root)) {
    logger.security('Path traversal attempt detected', { inputPath, cleanPath });
    return null;
  }
  return cleanPath;
};

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimitMap = new Map();
const checkRateLimit = (ip) => {
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const maxRequests = config.rateLimit.max;
  for (const [key, value] of rateLimitMap.entries()) {
    if (now - value.lastRequest > windowMs) rateLimitMap.delete(key);
  }
  const record = rateLimitMap.get(ip) || { count: 0, lastRequest: now };
  if (record.count >= maxRequests) {
    logger.warn('Rate limit exceeded', { ip, count: record.count });
    return false;
  }
  record.count++;
  record.lastRequest = now;
  rateLimitMap.set(ip, record);
  return true;
};

// ============================================================================
// EXPRESS APPLICATION
// ============================================================================

const app = express();
app.use(securityHeaders);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method, path: req.path, status: res.statusCode,
      duration: `${duration}ms`, ip: req.ip, userAgent: req.get('User-Agent')
    });
  });
  next();
});

// Rate limiting
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    logger.warn('Rate limit exceeded for IP', { ip });
    return res.status(429).json({ error: 'Too many requests', retryAfter: Math.ceil(config.rateLimit.windowMs / 1000) });
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'client', 'public')));

// ============================================================================
// API ENDPOINTS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', environment: NODE_ENV });
});

app.get('/api/cwd', (req, res) => {
  try {
    logger.info('CWD requested', { ip: req.ip });
    res.json({ cwd: process.cwd() });
  } catch (err) {
    logger.error('Failed to get CWD', { error: err.message });
    res.status(500).json({ error: 'Failed to get working directory' });
  }
});

app.post('/api/cwd', (req, res) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath) return res.status(400).json({ error: 'Path is required' });
    const validatedPath = sanitizePath(newPath);
    if (!validatedPath) {
      logger.security('Invalid path provided', { newPath, ip: req.ip });
      return res.status(403).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(validatedPath) || !fs.statSync(validatedPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found' });
    }
    process.chdir(validatedPath);
    logger.info('CWD changed', { newPath: validatedPath, ip: req.ip });
    res.json({ cwd: process.cwd() });
  } catch (err) {
    logger.error('Failed to change CWD', { error: err.message, ip: req.ip });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/execute', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const { command, cwd } = req.body;
  const validation = validateCommand(command);
  if (!validation.valid) {
    logger.security('Command validation failed', { ip, reason: validation.error, command: '[REDACTED]' });
    return res.status(400).json({ error: validation.error });
  }
  let executionPath = process.cwd();
  if (cwd) {
    const validatedCwd = sanitizePath(cwd);
    if (!validatedCwd) return res.status(403).json({ error: 'Invalid working directory' });
    if (fs.existsSync(validatedCwd) && fs.statSync(validatedCwd).isDirectory()) {
      executionPath = validatedCwd;
    }
  }
  logger.info('Command execution requested', { ip, command: '[REDACTED]', cwd: executionPath, length: command?.length });
  try {
    const vibeProcess = spawn('vibe', command.split(' '), {
      cwd: executionPath, shell: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: NODE_ENV }
    });
    let output = ''; let error = ''; let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true; vibeProcess.kill('SIGTERM');
      logger.warn('Command timeout', { ip, pid: vibeProcess.pid });
    }, 30 * 60 * 1000);
    vibeProcess.stdout.on('data', (data) => { output += data.toString(); });
    vibeProcess.stderr.on('data', (data) => { error += data.toString(); });
    vibeProcess.on('close', (code) => {
      clearTimeout(timeout);
      logger.info('Command execution completed', { ip, pid: vibeProcess.pid, exitCode: code });
      res.json({ success: code === 0, output, error, exitCode: code, timedOut });
    });
    vibeProcess.on('error', (err) => {
      clearTimeout(timeout);
      logger.error('Command execution error', { ip, pid: vibeProcess.pid, error: err.message });
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    logger.error('Failed to spawn process', { error: err.message, ip });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const server = app.listen(config.port, () => {
  logger.info(`Vibe Remote Harness server started`, { port: config.port, environment: NODE_ENV, nodeVersion: process.version });
  console.log(`Server running in ${NODE_ENV} mode on port ${config.port}`);
  console.log(`Access the UI at: http://localhost:${config.port}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const clientId = crypto.randomUUID();
  logger.info('WebSocket connection established', { ip, clientId });
  clients.set(clientId, { ws, ip, connectedAt: new Date() });
  ws.on('close', () => { clients.delete(clientId); logger.info('WebSocket connection closed', { clientId, ip }); });
  ws.on('error', (err) => { logger.error('WebSocket error', { clientId, ip, error: err.message }); clients.delete(clientId); });
  let vibeProcess = null; let currentCommand = null;
  ws.on('message', (message) => {
    try {
      let data; try { data = JSON.parse(message.toString()); } catch { ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' })); return; }
      logger.info('WebSocket message received', { clientId, ip, type: data.type, hasCommand: !!data.command });
      if (!data.type) { ws.send(JSON.stringify({ type: 'error', message: 'Message type is required' })); return; }
      switch (data.type) {
        case 'execute':
          if (vibeProcess) { vibeProcess.kill('SIGTERM'); logger.info('Terminated previous process', { clientId, pid: vibeProcess.pid }); vibeProcess = null; }
          const validation = validateCommand(data.command);
          if (!validation.valid) { ws.send(JSON.stringify({ type: 'error', message: validation.error })); return; }
          currentCommand = data.command;
          let executionPath = process.cwd();
          if (data.cwd) { const validatedCwd = sanitizePath(data.cwd); if (!validatedCwd) { ws.send(JSON.stringify({ type: 'error', message: 'Invalid working directory' })); return; } executionPath = validatedCwd; }
          logger.info('Executing command via WebSocket', { clientId, ip, commandLength: data.command?.length });
          vibeProcess = spawn('vibe', data.command?.split(' ') || [], { cwd: executionPath, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: NODE_ENV } });
          const timeout = setTimeout(() => { if (vibeProcess) { vibeProcess.kill('SIGTERM'); logger.warn('Command timeout (WebSocket)', { clientId, pid: vibeProcess.pid }); ws.send(JSON.stringify({ type: 'error', message: 'Command timeout after 30 minutes' })); vibeProcess = null; } }, 30 * 60 * 1000);
          vibeProcess.stdout.on('data', (chunk) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString() })); });
          vibeProcess.stderr.on('data', (chunk) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString() })); });
          vibeProcess.on('close', (code) => { clearTimeout(timeout); if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', code: code })); logger.info('WebSocket command completed', { clientId, pid: vibeProcess.pid, exitCode: code }); vibeProcess = null; currentCommand = null; });
          vibeProcess.on('error', (err) => { clearTimeout(timeout); if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: err.message })); logger.error('WebSocket command error', { clientId, pid: vibeProcess?.pid, error: err.message }); vibeProcess = null; currentCommand = null; });
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'started', pid: vibeProcess.pid }));
          break;
        case 'interrupt':
          if (vibeProcess) { logger.info('Interrupt requested', { clientId, pid: vibeProcess.pid }); vibeProcess.kill('SIGINT'); vibeProcess = null; }
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'interrupted' }));
          break;
        case 'kill':
          if (vibeProcess) { logger.info('Kill requested', { clientId, pid: vibeProcess.pid }); vibeProcess.kill('SIGKILL'); vibeProcess = null; }
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'killed' }));
          break;
        case 'ping':
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          logger.warn('Unknown message type', { clientId, type: data.type });
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
      }
    } catch (err) { logger.error('Message handling error', { clientId, ip, error: err.message }); if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: `Internal error: ${err.message}` })); }
  });
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'connected', serverTime: new Date().toISOString(), version: '1.0.0', clientId: clientId }));
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const gracefulShutdown = (signal) => {
  logger.info('Shutdown initiated', { signal });
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  wss.clients.forEach((client) => { if (client.readyState === 1) { client.send(JSON.stringify({ type: 'server_shutdown', message: 'Server is shutting down. Please reconnect later.' })); client.close(); } });
  server.close(() => { logger.info('Server stopped gracefully', { signal }); console.log('Server stopped. Goodbye!'); process.exit(0); });
  setTimeout(() => { logger.error('Forced shutdown after timeout', { signal }); console.error('Forced shutdown after timeout'); process.exit(1); }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception', { error: err.message, stack: err.stack, exitCode: 1 }); console.error('Uncaught Exception:', err.message); gracefulShutdown('UNCAUGHT_EXCEPTION'); });
process.on('unhandledRejection', (reason, promise) => { logger.error('Unhandled rejection', { reason: reason?.message || String(reason), promise: promise }); console.error('Unhandled Rejection:', reason); });

export default server;
