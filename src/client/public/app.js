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
const clearBtn = document.getElementById('clearBtn');
const wsUrlElement = document.getElementById('wsUrl');
const currentDirElement = document.getElementById('currentDir');

// State
let ws = null;
let conversations = [];
let currentConversation = null;
let currentProcessId = null;
let isProcessing = false;

// Auto-resizing textarea
promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
});

// Initialize
function init() {
    loadConversations();
    connectWebSocket();
    setupEventListeners();
    updateActionState();
}

// Setup event listeners
function setupEventListeners() {
    sendBtn.addEventListener('click', handleSend);
    newConversationBtn.addEventListener('click', newConversation);
    clearBtn.addEventListener('click', clearChat);
    interruptBtn.addEventListener('click', () => sendWebSocketMessage({ type: 'interrupt' }));
    
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
}

// Connect to WebSocket server
function connectWebSocket() {
    const wsUrl = wsUrlElement.textContent;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            updateConnectionStatus(true);
            statusText.textContent = 'Connected';
            serverStatus.classList.remove('disconnected');
            
            // Request current directory
            fetch('/api/cwd')
                .then(r => r.json())
                .then(data => {
                    currentDirElement.textContent = data.cwd || 'Unknown';
                })
                .catch(() => {
                    currentDirElement.textContent = 'Unknown';
                });
        };
        
        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus(false);
            statusText.textContent = 'Disconnected';
            serverStatus.classList.add('disconnected');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
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
        setTimeout(connectWebSocket, 3000);
    }
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
function sendWebSocketMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.warn('WebSocket not connected, cannot send message');
        // Queue the message and send when connected
        setTimeout(() => sendWebSocketMessage(message), 1000);
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
            currentProcessId = data.pid;
            isProcessing = true;
            updateActionState();
            currentAction.textContent = `Running (PID: ${data.pid})`;
            addAssistantMessage('Thinking...', true);
            break;
            
        case 'stdout':
            updateLastAssistantMessage(data.data, false);
            break;
            
        case 'stderr':
            updateLastAssistantMessage(data.data, false);
            break;
            
        case 'exit':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            currentAction.textContent = `Exited with code ${data.code}`;
            updateLastAssistantMessage('\n[Process finished]', true);
            break;
            
        case 'error':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            updateLastAssistantMessage(`\nError: ${data.message}`, true);
            currentAction.textContent = 'Error';
            break;
            
        case 'interrupted':
        case 'killed':
            isProcessing = false;
            currentProcessId = null;
            updateActionState();
            updateLastAssistantMessage('\n[Process interrupted]', true);
            currentAction.textContent = data.type === 'killed' ? 'Killed' : 'Interrupted';
            break;
            
        default:
            console.warn('Unknown message type:', data.type);
    }
}

// Handle send button click
function handleSend() {
    const text = promptInput.value.trim();
    if (!text || isProcessing) return;
    
    // Add user message
    addUserMessage(text);
    promptInput.value = '';
    promptInput.style.height = 'auto';
    
    // Determine if this is a command or a chat message
    let command = text;
    
    // If it doesn't start with a known command, treat it as a chat message
    // For chat mode, we'd need to pass it differently, but for now we'll treat everything as a command
    
    // Send to server
    sendWebSocketMessage({
        type: 'execute',
        command: command,
        cwd: currentDirElement.textContent
    });
    
    currentAction.textContent = 'Processing...';
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

// Add assistant message to chat
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

// Update last assistant message (for streaming)
function updateLastAssistantMessage(text, isComplete) {
    const messages = chatArea.querySelectorAll('.message.assistant');
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage) {
        const bubble = lastMessage.querySelector('.bubble');
        if (bubble) {
            // Handle markdown in the response
            const formattedText = formatMessage(text, isComplete);
            bubble.innerHTML = formattedText;
            
            // Update in conversation
            if (currentConversation && currentConversation.messages.length > 0) {
                const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    if (isComplete) {
                        lastMsg.content += text;
                        lastMsg.isStreaming = false;
                    } else {
                        lastMsg.content = (lastMsg.content || '') + text;
                    }
                    saveConversations();
                }
            }
        }
    }
    scrollToBottom();
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
    
    if (isStreaming) {
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
    if (isComplete && formatted.includes('$ ') || formatted.includes('> ')) {
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
        const messageDiv = createMessageElement(msg.role, msg.content, msg.isStreaming);
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
            connectWebSocket();
        }
    }
});

// Export for debugging
window.vibeHarness = {
    ws,
    conversations,
    currentConversation,
    sendWebSocketMessage,
    connectWebSocket
};
