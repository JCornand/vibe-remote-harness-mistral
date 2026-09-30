/**
 * Mistral Vibe Remote Harness - Client Application
 * 
 * This script handles the WebSocket connection to the server and manages
 * the UI for controlling Mistral Vibe remotely.
 */

// DOM Elements
const chatArea = document.getElementById('chatArea');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const newConversationBtn = document.getElementById('newConversationBtn');
const conversationList = document.getElementById('conversationList');
const serverStatus = document.getElementById('serverStatus');
const statusText = document.getElementById('statusText');
const connectionStatus = document.getElementById('connectionStatus');
const currentAction = document.getElementById('currentAction');
const interruptBtn = document.getElementById('interruptBtn');
const killBtn = document.getElementById('killBtn');
const clearBtn = document.getElementById('clearBtn');
const wsUrlElement = document.getElementById('wsUrl');
const httpUrlElement = document.getElementById('httpUrl');
const currentDirElement = document.getElementById('currentDir');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const settingsClose = document.getElementById('settingsClose');
const cwdInput = document.getElementById('cwdInput');
const applyCwdBtn = document.getElementById('applyCwdBtn');

// State
let ws = null;
let conversations = [];
let currentConversation = null;
let currentProcessId = null;
let isProcessing = false;
let currentCwd = null;
let activeBubble = null;
let streamBuffer = '';
let reconnectTimer = null;

const RECONNECT_DELAY_MS = 3000;
const MAX_SEND_RETRIES = 20;

// Auto-resizing textarea
promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
});

// Initialize
function init() {
    showConnectionUrls();
    loadConversations();
    connectWebSocket();
    setupEventListeners();
    updateActionState();
}

// Derive connection URLs from the page location so any port works
function showConnectionUrls() {
    wsUrlElement.textContent = getWebSocketUrl();
    httpUrlElement.textContent = location.origin;
}

function getWebSocketUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
}

// Setup event listeners
function setupEventListeners() {
    sendBtn.addEventListener('click', handleSend);
    newConversationBtn.addEventListener('click', newConversation);
    clearBtn.addEventListener('click', clearChat);
    interruptBtn.addEventListener('click', () => sendWebSocketMessage({ type: 'interrupt' }));
    killBtn.addEventListener('click', () => sendWebSocketMessage({ type: 'kill' }));
    settingsToggle.addEventListener('click', () => settingsPanel.classList.add('active'));
    settingsClose.addEventListener('click', () => settingsPanel.classList.remove('active'));
    applyCwdBtn.addEventListener('click', applyCwd);
    
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Ctrl+C interrupts the running process (matches the button label)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'c' && isProcessing) {
            e.preventDefault();
            sendWebSocketMessage({ type: 'interrupt' });
        }
    });
}

// Change the server working directory via POST /api/cwd
function applyCwd() {
    const newPath = cwdInput.value.trim();
    if (!newPath) return;
    fetch('/api/cwd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
    })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            currentCwd = data.cwd || null;
            currentDirElement.textContent = currentCwd || 'Unknown';
            cwdInput.value = '';
        })
        .catch(err => {
            console.error('Failed to change working directory:', err);
            currentAction.textContent = `Directory change failed: ${err.message}`;
        });
}

// Connect to WebSocket server
function connectWebSocket() {
    const wsUrl = getWebSocketUrl();
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            updateConnectionStatus(true);
            statusText.textContent = 'Connected';
            serverStatus.classList.remove('disconnected');
            refreshCwd();
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus(false);
            statusText.textContent = 'Disconnected';
            serverStatus.classList.add('disconnected');
            if (isProcessing) {
                isProcessing = false;
                currentProcessId = null;
                updateActionState();
                currentAction.textContent = 'Disconnected';
                if (activeBubble) {
                    finalizeStream('\n[Connection lost]');
                }
            }
            scheduleReconnect();
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
            statusText.textContent = 'Connection error';
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
        
    } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        updateConnectionStatus(false);
        statusText.textContent = 'Connection failed';
        scheduleReconnect();
    }
}

// Fetch the current working directory from the server
function refreshCwd() {
    fetch('/api/cwd')
        .then(r => r.json())
        .then(data => {
            currentCwd = data.cwd || null;
            currentDirElement.textContent = currentCwd || 'Unknown';
        })
        .catch(() => {
            currentDirElement.textContent = 'Unknown';
        });
}

// Single pending reconnect attempt, never stacks timers
function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
    }, RECONNECT_DELAY_MS);
}

// Update connection status UI
function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.classList.remove('disconnected');
    } else {
        connectionStatus.classList.add('disconnected');
    }
}

// Send WebSocket message
function sendWebSocketMessage(message, attempt = 0) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else if (ws && ws.readyState === WebSocket.CONNECTING && attempt < MAX_SEND_RETRIES) {
        setTimeout(() => sendWebSocketMessage(message, attempt + 1), 500);
    } else {
        console.warn('WebSocket not connected, cannot send message');
        currentAction.textContent = 'Not connected';
    }
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    console.log('Received message:', data);
    
    switch (data.type) {
        case 'connected':
            // Server connection established
            break;
            
        case 'started':
            if (activeBubble) {
                finalizeStream('\n[Superseded by a new command]');
            }
            currentProcessId = data.pid;
            isProcessing = true;
            updateActionState();
            currentAction.textContent = `Running (PID: ${data.pid})`;
            streamBuffer = '';
            activeBubble = startAssistantStream();
            break;
            
        case 'stdout':
            appendStreamChunk(data.data || '');
            break;
            
        case 'stderr':
            appendStreamChunk(data.data || '');
            break;
            
        case 'exit':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            currentAction.textContent = `Exited with code ${data.code}`;
            finalizeStream(`\n[Process finished with exit code ${data.code}]`);
            break;
            
        case 'error':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            currentAction.textContent = 'Error';
            finalizeStream(`\nError: ${data.message}`);
            break;
            
        case 'interrupted':
        case 'killed':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            currentAction.textContent = data.type === 'killed' ? 'Killed' : 'Interrupted';
            finalizeStream('\n[Process interrupted]');
            break;
            
        case 'server_shutdown':
            if (activeBubble) {
                finalizeStream('\n[Server is shutting down]');
            }
            break;
            
        default:
            console.warn('Unknown message type:', data.type);
    }
}

// Handle send button click
function handleSend() {
    const text = promptInput.value.trim();
    if (!text || isProcessing) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        currentAction.textContent = 'Not connected';
        return;
    }
    
    // Add user message
    addUserMessage(text);
    promptInput.value = '';
    promptInput.style.height = 'auto';
    
    // Send to server
    sendWebSocketMessage({
        type: 'execute',
        command: text,
        cwd: currentCwd || undefined
    });
    
    currentAction.textContent = 'Processing...';
}

// --- Streaming output handling ---

// Create the assistant bubble that will receive streamed output
function startAssistantStream() {
    const messageDiv = createMessageElement('assistant', '', true);
    chatArea.appendChild(messageDiv);
    chatArea.classList.remove('empty');
    scrollToBottom();
    if (currentConversation) {
        currentConversation.messages.push({
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            isStreaming: true
        });
    }
    return messageDiv.querySelector('.bubble');
}

// Append a chunk to the active bubble, rendering the accumulated buffer
function appendStreamChunk(chunk) {
    if (!activeBubble) {
        activeBubble = startAssistantStream();
    }
    streamBuffer += chunk;
    activeBubble.innerHTML = formatMessage(streamBuffer, false);
    updateStoredStream(false);
    scrollToBottom();
}

// Close the active bubble with a trailing status line
function finalizeStream(suffix) {
    if (!activeBubble) {
        activeBubble = startAssistantStream();
    }
    streamBuffer += suffix;
    activeBubble.innerHTML = formatMessage(streamBuffer, true);
    updateStoredStream(true);
    activeBubble = null;
    streamBuffer = '';
    scrollToBottom();
}

// Mirror the streamed buffer into the persisted conversation
function updateStoredStream(final) {
    if (!currentConversation || currentConversation.messages.length === 0) return;
    const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
    if (lastMsg.role !== 'assistant') return;
    lastMsg.content = streamBuffer;
    if (final) {
        lastMsg.isStreaming = false;
        saveConversations();
    }
}

// Add user message to chat
function addUserMessage(text) {
    const messageDiv = createMessageElement('user', text);
    chatArea.appendChild(messageDiv);
    chatArea.classList.remove('empty');
    scrollToBottom();
    
    // Save to conversation
    if (currentConversation) {
        currentConversation.messages.push({
            role: 'user',
            content: text,
            timestamp: new Date().toISOString()
        });
        saveConversations();
    }
}

// Add assistant message to chat (non-streaming, e.g. welcome text)
function addAssistantMessage(text, isStreaming) {
    const messageDiv = createMessageElement('assistant', text, isStreaming);
    chatArea.appendChild(messageDiv);
    chatArea.classList.remove('empty');
    scrollToBottom();
    
    // Save to conversation
    if (currentConversation) {
        currentConversation.messages.push({
            role: 'assistant',
            content: text,
            timestamp: new Date().toISOString(),
            isStreaming: isStreaming
        });
        saveConversations();
    }
}

// Create message element
function createMessageElement(role, content, isStreaming = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'U' : 'V';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    if (isStreaming && !content) {
        bubble.innerHTML = '<span class="status"><span class="status-dots"><span></span><span></span><span></span></span></span>';
    } else {
        bubble.innerHTML = formatMessage(content, !isStreaming);
    }
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString();
    
    contentDiv.appendChild(bubble);
    contentDiv.appendChild(timestamp);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    
    return messageDiv;
}

// Format message with markdown support
function formatMessage(text, isComplete) {
    if (!text) return '';
    
    // Escape HTML
    let formatted = escapeHtml(text);
    
    // Simple markdown support
    // Code blocks
    formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Terminal-like output (for command results)
    if (isComplete && (formatted.includes('$ ') || formatted.includes('> '))) {
        formatted = `<pre class="terminal-output">${formatted}</pre>`;
    }
    
    return formatted;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Scroll to bottom
function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

// Update action button state
function updateActionState() {
    interruptBtn.disabled = !isProcessing;
    killBtn.disabled = !isProcessing;
}

// New conversation
function newConversation() {
    const id = Date.now().toString();
    const name = `Conversation ${conversations.length + 1}`;
    
    currentConversation = {
        id: id,
        name: name,
        messages: [],
        createdAt: new Date().toISOString()
    };
    
    conversations.unshift(currentConversation);
    saveConversations();
    renderConversations();
    
    // Clear chat area
    chatArea.innerHTML = '';
    chatArea.classList.add('empty');
    
    // Add welcome message
    setTimeout(() => {
        addAssistantMessage('Hello! I am Mistral Vibe. How can I help you today?\n\nYou can ask me to perform tasks like:\n- `ls` - List files\n- `read_file path/to/file` - Read a file\n- `grep pattern path` - Search files\n- Or just chat with me naturally!', false);
    }, 100);
}

// Clear chat
function clearChat() {
    if (currentConversation) {
        currentConversation.messages = [];
        saveConversations();
        chatArea.innerHTML = '';
        chatArea.classList.add('empty');
    }
}

// Load conversations
function loadConversations() {
    try {
        const saved = localStorage.getItem('vibe-conversations');
        if (saved) {
            conversations = JSON.parse(saved);
            if (conversations.length > 0) {
                currentConversation = conversations[0];
                renderConversations();
                renderChatHistory();
            } else {
                newConversation();
            }
        } else {
            newConversation();
        }
    } catch (error) {
        console.error('Failed to load conversations:', error);
        newConversation();
    }
}

// Save conversations
function saveConversations() {
    try {
        localStorage.setItem('vibe-conversations', JSON.stringify(conversations));
    } catch (error) {
        console.error('Failed to save conversations:', error);
    }
}

// Render conversations
function renderConversations() {
    conversationList.innerHTML = '';
    
    conversations.forEach(convo => {
        const item = document.createElement('div');
        item.className = `conversation-item ${convo.id === currentConversation?.id ? 'active' : ''}`;
        
        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        
        const content = document.createElement('div');
        content.className = 'content';
        
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = convo.name;
        
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date(convo.createdAt).toLocaleDateString();
        
        content.appendChild(title);
        content.appendChild(timestamp);
        
        item.appendChild(icon);
        item.appendChild(content);
        
        item.addEventListener('click', () => {
            currentConversation = convo;
            renderConversations();
            renderChatHistory();
        });
        
        conversationList.appendChild(item);
    });
}

// Render chat history
function renderChatHistory() {
    if (!currentConversation) return;
    
    chatArea.innerHTML = '';
    
    if (currentConversation.messages.length === 0) {
        chatArea.classList.add('empty');
        return;
    }
    
    chatArea.classList.remove('empty');
    
    currentConversation.messages.forEach(msg => {
        const messageDiv = createMessageElement(msg.role, msg.content, msg.isStreaming && !msg.content);
        chatArea.appendChild(messageDiv);
    });
    
    scrollToBottom();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Handle page visibility changes to reconnect WebSocket
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Check if WebSocket is still connected
        if (ws && ws.readyState !== WebSocket.OPEN) {
            scheduleReconnect();
        }
    }
});

// Export for debugging (getters expose live state)
window.vibeHarness = {
    get ws() { return ws; },
    get conversations() { return conversations; },
    get currentConversation() { return currentConversation; },
    get currentCwd() { return currentCwd; },
    sendWebSocketMessage,
    connectWebSocket
};
