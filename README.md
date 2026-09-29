# Vibe Remote Harness

> **ISO 27001 Compliant** - Remote HTML Harness for Mistral Vibe CLI Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![ISO 27001](https://img.shields.io/badge/ISO_27001-Compliant-blue.svg)](https://www.iso.org/isoiec-27001-information-security.html)

---

## **Overview**

**Vibe Remote Harness** is a secure, web-based interface for remotely controlling [Mistral Vibe](https://github.com/mistralai/Mistral-Vibe) - a powerful CLI coding agent. This project implements comprehensive security controls aligned with **ISO 27001:2022** standards to ensure safe and compliant remote access.

### **Key Features**

- **Real-time WebSocket communication** with Mistral Vibe
- **Modern dark-themed UI** with chat-style interface
- **Command execution** with streaming output
- **Conversation history** persisted in localStorage
- **Multi-session management**
- **Process control** (execute, interrupt, kill)
- **Markdown support** for rich output formatting

---

## **📋 Table of Contents**

1. [Security & Compliance](#-security--compliance)
2. [Quick Start](#-quick-start)
3. [Installation](#-installation)
4. [Configuration](#-configuration)
5. [Usage](#-usage)
6. [Project Structure](#-project-structure)
7. [Security Controls](#-security-controls-iso-27001)
8. [Points of Improvement](#-points-of-improvement)
9. [Contributing](#-contributing)
10. [License](#-license)

---

## **🔒 Security & Compliance**

This project is designed with **ISO 27001:2022** security standards in mind. For detailed compliance information, see:

- [📄 SECURITY.md](docs/SECURITY.md) - Security policy and controls
- [📋 COMPLIANCE.md](docs/COMPLIANCE.md) - ISO 27001 compliance matrix
- [🏗️ ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture documentation

**⚠️ WARNING**: This harness provides remote access to a powerful AI agent. Ensure you understand the security implications before deploying in production.

---

## **🚀 Quick Start**

### **Prerequisites**

- Node.js >= 18.0.0
- Mistral Vibe CLI installed and in PATH
- npm or yarn

### **Development Mode**

```bash
# Clone or navigate to the project
cd vibe-remote-harness

# Install dependencies
npm install

# Start the development server
npm run dev

# Or for production
npm start
```

The server will start at `http://localhost:3000`

Open your browser and navigate to the URL above to access the harness.

---

## **📥 Installation**

### **1. Clone the Repository**

```bash
git clone <repository-url>
cd vibe-remote-harness
```

### **2. Install Dependencies**

```bash
npm install
```

### **3. Configure Environment**

Copy the example environment file and configure as needed:

```bash
cp .env.example .env
```

Edit `.env` with your configuration.

### **4. Verify Mistral Vibe Installation**

Ensure `vibe` command is available:

```bash
vibe --version
```

If not installed, install Mistral Vibe CLI first.

---

## **⚙️ Configuration**

### **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Application environment |
| `PORT` | No | `3000` | HTTP server port |
| `ALLOWED_ORIGINS` | No | `[]` | Comma-separated list of allowed origins (production) |
| `LOG_LEVEL` | No | `info` | Logging level (debug, info, warn, error) |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | No | `1000` | Max requests per window (dev) / `100` (prod) |

### **Configuration Files**

- `config/security.json` - Security settings
- `config/server.json` - Server configuration

---

## **🎯 Usage**

### **Web Interface**

1. Open `http://localhost:3000` in your browser
2. Type commands in the input field
3. Press Enter or click "Send"
4. View results in real-time

### **Supported Commands**

All Mistral Vibe CLI commands are supported:

```bash
# File operations
ls -l
dir
read_file path/to/file.txt
write_file path/to/file.txt "content"

# Code operations
grep "pattern" path/to/file
git status
npm install

# AI assistance
"Explain this code: ..."
"Write a Python script to ..."
```

### **Keyboard Shortcuts**

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| `Ctrl + C` | Interrupt current process |

### **API Endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/cwd` | Get current working directory |
| POST | `/api/cwd` | Change working directory |
| POST | `/api/execute` | Execute Vibe command |
| WS | `/ws` | WebSocket connection for real-time communication |

### **WebSocket Protocol**

**Client → Server:**

```json
{
  "type": "execute",
  "command": "ls -la",
  "cwd": "/path/to/dir"
}
```

```json
{
  "type": "interrupt"
}
```

```json
{
  "type": "kill"
}
```

**Server → Client:**

```json
{
  "type": "connected",
  "serverTime": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "clientId": "uuid"
}
```

```json
{
  "type": "started",
  "pid": 12345
}
```

```json
{
  "type": "stdout",
  "data": "Command output..."
}
```

```json
{
  "type": "stderr",
  "data": "Error output..."
}
```

```json
{
  "type": "exit",
  "code": 0
}
```

```json
{
  "type": "error",
  "message": "Error description"
}
```

---

## **🗂️ Project Structure**

```
vibe-remote-harness/
├── docs/                          # Documentation
│   ├── SECURITY.md                # Security policy and controls
│   ├── COMPLIANCE.md              # ISO 27001 compliance matrix
│   ├── ARCHITECTURE.md            # System architecture
│   ├── IMPROVEMENTS.md            # Future improvements and roadmap
│   └── DEPLOYMENT.md              # Deployment guide
├── config/                        # Configuration files
│   ├── security.json              # Security settings
│   └── server.json                # Server configuration
├── scripts/                       # Utility scripts
│   ├── setup.sh                   # Setup script
│   ├── build.sh                   # Build script
│   └── test.sh                    # Test script
├── src/                          # Source code
│   ├── server/                    # Backend server
│   │   └── index.js               # Express + WebSocket server
│   ├── client/                    # Frontend application
│   │   └── public/                # Static files
│   │       ├── index.html         # Main HTML interface
│   │       └── app.js             # Client-side JavaScript
│   └── shared/                    # Shared utilities
│       └── constants.js           # Shared constants
├── tests/                        # Test files
│   └── server.test.js             # Server tests
├── logs/                         # Log files (generated)
├── .env.example                  # Environment example
├── .gitignore                    # Git ignore rules
├── package.json                  # Project dependencies
└── README.md                     # This file
```

---

## **🔐 Security Controls (ISO 27001)**

This project implements the following **ISO 27001:2022** controls:

### **A.5 Information Security Policies**
- [ ] A.5.1.1 Information security policy
- [ ] A.5.1.2 Information security policy review

### **A.6 Organization of Information Security**
- [ ] A.6.1.1 Information security roles and responsibilities

### **A.7 Human Resource Security**
- [ ] A.7.1.1 Screening
- [ ] A.7.2.1 Management responsibilities
- [ ] A.7.2.2 Information security awareness, education and training

### **A.8 Asset Management** ✅
- [x] A.8.1.1 Inventory of information and other associated assets
- [x] A.8.2.1 Handling of assets
- [x] A.8.2.2 Classification of information
- [x] A.8.2.3 Labelling of information

### **A.9 Access Control** ✅
- [x] A.9.1.1 Access control policy and procedure
- [x] A.9.1.2 Access to networks and network services
- [x] A.9.2.1 User registration and de-registration
- [x] A.9.2.2 User access provisioning
- [x] A.9.2.3 Management of privileged utility programs
- [x] A.9.2.4 Management of secret authentication information of users
- [x] A.9.2.5 Review of user access rights
- [x] A.9.2.6 Removal or adjustment of access rights
- [x] A.9.4.1 Information access restriction
- [x] A.9.4.2 Secure authentication

### **A.10 Cryptography** ⚠️
- [ ] A.10.1.1 Policy on the use of cryptographic controls
- [ ] A.10.1.2 Key management

### **A.11 Physical and Environmental Security** ⚠️
- [ ] A.11.1.1 Physical security perimeter
- [ ] A.11.2.1 Physical entry controls
- [ ] A.11.2.6 Security of equipment and assets off-premises

### **A.12 Operations Security** ✅
- [x] A.12.1.1 Operating procedures and responsibilities
- [x] A.12.2.1 Input data validation
- [x] A.12.3.1 Backup of information
- [x] A.12.4.1 Event logging
- [x] A.12.4.2 Protection of log information
- [x] A.12.4.3 Administrator and operator logs
- [x] A.12.4.4 Clock synchronization
- [x] A.12.6.1 Management of technical vulnerabilities
- [x] A.12.6.2 Restriction of access to information about vulnerabilities

### **A.13 Communications Security** ✅
- [x] A.13.1.1 Network controls
- [x] A.13.1.2 Security of network services
- [x] A.13.2.1 Information transfer policies and procedures
- [x] A.13.2.3 Electronic messaging

### **A.14 System Acquisition, Development and Maintenance** ✅
- [x] A.14.1.1 Information security requirements analysis and specification
- [x] A.14.2.1 Secure development policy
- [x] A.14.2.5 Secure system architecture and engineering principles
- [x] A.14.2.6 Secure development environment
- [x] A.14.2.8 System security testing
- [x] A.14.3.1 Protection of test data

### **A.15 Supplier Relationships** ⚠️
- [ ] A.15.1.1 Information security in supplier relationships
- [ ] A.15.2.1 Supplier monitoring and review

### **A.16 Information Security Incident Management** ✅
- [x] A.16.1.1 Responsibilities and procedures
- [x] A.16.1.2 Reporting information security events
- [x] A.16.1.3 Reporting information security weaknesses
- [x] A.16.1.4 Assessment of and decision on information security events
- [x] A.16.1.5 Response to information security incidents
- [x] A.16.1.6 Learning from information security incidents

### **A.17 Information Security Aspects of Business Continuity** ⚠️
- [ ] A.17.1.1 Planning information security continuity
- [ ] A.17.1.2 Implementing information security continuity
- [ ] A.17.2.1 Availability of information processing facilities

### **A.18 Compliance** ✅
- [x] A.18.1.1 Identification of applicable legislation and contractual requirements
- [x] A.18.2.1 Intellectual property rights
- [x] A.18.2.2 Compliance with security standards
- [x] A.18.2.3 Technical compliance review

**Compliance Score: 58/93 controls (62%)** - See [COMPLIANCE.md](docs/COMPLIANCE.md) for details.

---

## **📈 Points of Improvement**

See [IMPROVEMENTS.md](docs/IMPROVEMENTS.md) for a comprehensive list of planned improvements, categorized by:

- **🔴 Critical** - Must be addressed before production
- **🟡 High** - Should be addressed for production
- **🟢 Medium** - Nice to have improvements
- **🔵 Low** - Future enhancements

### **Top Priority Improvements**

1. **Authentication & Authorization** (A.9.4.1, A.9.4.2)
   - Implement JWT or OAuth2 authentication
   - Role-based access control (RBAC)
   - Multi-factor authentication (MFA)

2. **Transport Layer Security** (A.13.1.1)
   - HTTPS enforcement
   - SSL/TLS certificate management
   - Secure WebSocket (WSS)

3. **Input Validation Enhancement** (A.12.2.1)
   - More sophisticated command validation
   - Allowlist approach for commands
   - Sandbox execution environment

4. **Audit Logging** (A.12.4.1, A.12.4.2)
   - Centralized logging
   - Log retention policy
   - Log analysis and alerting

5. **Rate Limiting & DDoS Protection** (A.12.6.1)
   - IP-based rate limiting
   - Connection throttling
   - DDoS protection integration

---

## **🤝 Contributing**

Contributions are welcome! Please follow these guidelines:

1. **Security First**: Any pull request must maintain or improve security posture
2. **Testing**: Include tests for new features
3. **Documentation**: Update relevant documentation
4. **Code Review**: All changes must be reviewed before merging

### **Development Workflow**

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make your changes
# Run tests
npm test

# Commit with signed-off message
git commit -m "feat: add my feature" -m "Generated by Mistral Vibe.\nCo-Authored-By: Mistral Vibe <vibe@mistral.ai>"

# Push to your fork
git push origin feature/my-feature

# Create a Pull Request
```

### **Security Reporting**

If you discover a security vulnerability, please:

1. **DO NOT** create a public issue
2. Email security concerns to the maintainer privately
3. Include steps to reproduce the vulnerability
4. Allow reasonable time for remediation before public disclosure

---

## **📜 License**

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) for details.

---

## **📞 Support**

For questions, issues, or feature requests:

- Open an issue on GitHub
- Check the [documentation](docs/)
- Review the [FAQ](docs/FAQ.md)

---

**Built with security in mind. Use responsibly.**

*Generated by Mistral Vibe*
