// ============================================
// UTILITIES - Helper functions and utilities
// ============================================

/**
 * Debounce function to limit the rate of function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format uptime from seconds to human readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} - Formatted uptime
 */
function formatUptime(seconds) {
    if (!seconds || seconds <= 0) return 'N/A';

    const days = Math.floor(seconds / (24 * 3600));
    seconds = seconds % (24 * 3600);
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Format bandwidth from bits to human readable format
 * @param {number} bits - Bandwidth in bits per second
 * @returns {string} - Formatted bandwidth
 */
function formatBandwidth(bits) {
    if (!bits || bits <= 0) return 'N/A';

    if (bits >= 1_000_000_000) {
        return `${(bits / 1_000_000_000).toFixed(2)} Gbps`;
    } else if (bits >= 1_000_000) {
        return `${(bits / 1_000_000).toFixed(2)} Mbps`;
    } else if (bits >= 1_000) {
        return `${(bits / 1_000).toFixed(2)} Kbps`;
    } else {
        return `${bits.toFixed(0)} bps`;
    }
}

/**
 * Format timestamp to readable date/time
 * @param {string|number|Date} timestamp - Timestamp to format
 * @returns {string} - Formatted date/time
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Sanitize string for safe usage
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
    if (!str) return '';
    return str.toString().replace(/[<>\"'&]/g, '');
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate random ID
 * @param {number} length - Length of ID
 * @returns {string} - Random ID
 */
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - True if successful
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy text: ', err);
        return false;
    }
}

/**
 * Download data as file
 * @param {string} data - Data to download
 * @param {string} filename - Filename
 * @param {string} type - MIME type
 */
function downloadFile(data, filename, type = 'text/plain') {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Parse query string parameters
 * @returns {Object} - Parsed parameters
 */
function parseQueryParams() {
    const params = {};
    const queryString = window.location.search.substring(1);
    const pairs = queryString.split('&');

    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) {
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
    }

    return params;
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${sanitizeString(message)}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i data-lucide="x"></i>
            </button>
        </div>
    `;

    // Add styles if not already added
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: var(--neutral-900);
                border: 1px solid var(--neutral-800);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                animation: slideInRight 0.3s ease-out;
                max-width: 400px;
            }
            
            .notification-success {
                border-color: var(--success);
            }
            
            .notification-error {
                border-color: var(--error);
            }
            
            .notification-warning {
                border-color: var(--warning);
            }
            
            .notification-info {
                border-color: var(--primary-500);
            }
            
            .notification-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-md);
            }
            
            .notification-message {
                flex: 1;
                color: var(--neutral-200);
            }
            
            .notification-close {
                background: none;
                border: none;
                color: var(--neutral-400);
                cursor: pointer;
                padding: 2px;
                border-radius: var(--radius-sm);
                transition: all var(--transition-fast);
            }
            
            .notification-close:hover {
                background-color: var(--neutral-700);
                color: var(--neutral-200);
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Initialize lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Auto remove after duration
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);
}

/**
 * Toggle collapsible section
 * @param {HTMLElement} header - Header element
 */
function toggleSection(header) {
    const content = header.nextElementSibling;
    const chevron = header.querySelector('.chevron');

    if (header.classList.contains('collapsed')) {
        header.classList.remove('collapsed');
        content.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
        header.classList.add('collapsed');
        content.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
}

/**
 * Local storage helpers
 */
const storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err) {
            console.error('Failed to save to localStorage:', err);
            return false;
        }
    },

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (err) {
            console.error('Failed to read from localStorage:', err);
            return defaultValue;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (err) {
            console.error('Failed to remove from localStorage:', err);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (err) {
            console.error('Failed to clear localStorage:', err);
            return false;
        }
    }
};

/**
 * API helper
 */
const api = {
    async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const config = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (err) {
            console.error('API request failed:', err);
            throw err;
        }
    },

    get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    },

    post(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    },
};

// Export utilities for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        debounce,
        formatUptime,
        formatBandwidth,
        formatTimestamp,
        sanitizeString,
        isValidEmail,
        isValidUrl,
        generateId,
        copyToClipboard,
        downloadFile,
        parseQueryParams,
        showNotification,
        toggleSection,
        storage,
        api,
    };
}
window.debounce = debounce;