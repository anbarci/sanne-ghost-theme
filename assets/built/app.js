/**
 * Sanne Ghost Theme JavaScript - Minified Version
 * Modern, accessible, and performant interactions
 */

(function() {
    'use strict';
    
    // Theme configuration
    const config = {
        enableSmoothScroll: true,
        enableLazyLoading: true,
        enableReadingProgress: true,
        enableDarkMode: true
    };
    
    // Utility functions
    const utils = {
        // Debounce function for performance
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        // Scroll to element
        scrollToElement(element, offset = 0) {
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    };
    
    // Reading progress bar
    const readingProgress = {
        init() {
            if (!config.enableReadingProgress) return;
            
            const progressBar = document.querySelector('.reading-progress-fill');
            if (!progressBar) return;
            
            const updateProgress = utils.debounce(() => {
                const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
                const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
                const scrolled = (winScroll / height) * 100;
                
                progressBar.style.width = Math.min(scrolled, 100) + '%';
            }, 10);
            
            window.addEventListener('scroll', updateProgress, { passive: true });
            updateProgress();
        }
    };
    
    // Mobile navigation
    const mobileNav = {
        init() {
            const navToggle = document.querySelector('.nav-toggle');
            const mobileMenu = document.querySelector('.mobile-menu');
            
            if (!navToggle || !mobileMenu) return;
            
            navToggle.addEventListener('click', this.toggleMenu.bind(this));
            document.addEventListener('click', this.handleOutsideClick.bind(this));
            document.addEventListener('keydown', this.handleKeydown.bind(this));
        },
        
        toggleMenu() {
            const navToggle = document.querySelector('.nav-toggle');
            const mobileMenu = document.querySelector('.mobile-menu');
            const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
            
            navToggle.setAttribute('aria-expanded', !isOpen);
            mobileMenu.setAttribute('aria-hidden', isOpen);
            
            navToggle.classList.toggle('nav-toggle-active');
            mobileMenu.classList.toggle('mobile-menu-active');
            document.body.classList.toggle('nav-open');
        },
        
        closeMenu() {
            const navToggle = document.querySelector('.nav-toggle');
            const mobileMenu = document.querySelector('.mobile-menu');
            
            if (!navToggle || !mobileMenu) return;
            
            navToggle.setAttribute('aria-expanded', 'false');
            mobileMenu.setAttribute('aria-hidden', 'true');
            navToggle.classList.remove('nav-toggle-active');
            mobileMenu.classList.remove('mobile-menu-active');
            document.body.classList.remove('nav-open');
        },
        
        handleOutsideClick(e) {
            const navToggle = document.querySelector('.nav-toggle');
            const mobileMenu = document.querySelector('.mobile-menu');
            
            if (!navToggle || !mobileMenu) return;
            if (!navToggle.contains(e.target) && !mobileMenu.contains(e.target)) {
                this.closeMenu();
            }
        },
        
        handleKeydown(e) {
            if (e.key === 'Escape') {
                this.closeMenu();
            }
        }
    };
    
    // Newsletter form handling
    const newsletterForm = {
        init() {
            const forms = document.querySelectorAll('[data-members-form="subscribe"]');
            forms.forEach(form => {
                form.addEventListener('submit', this.handleSubmit.bind(this));
            });
        },
        
        handleSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const email = form.querySelector('input[name="email"]').value;
            
            if (!this.validateEmail(email)) {
                this.showMessage(form, 'error');
                return;
            }
            
            this.showLoading(form, true);
            
            // Ghost Members API would handle this
            setTimeout(() => {
                this.showLoading(form, false);
                this.showMessage(form, 'success');
                form.reset();
            }, 1000);
        },
        
        validateEmail(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },
        
        showLoading(form, isLoading) {
            form.classList.toggle('loading', isLoading);
            const button = form.querySelector('button[type="submit"]');
            button.disabled = isLoading;
        },
        
        showMessage(form, type) {
            form.classList.remove('success', 'error');
            form.classList.add(type);
            
            setTimeout(() => {
                form.classList.remove(type);
            }, 5000);
        }
    };
    
    // Social sharing
    const socialSharing = {
        init() {
            const shareButtons = document.querySelectorAll('.share-button:not(.share-copy)');
            shareButtons.forEach(button => {
                button.addEventListener('click', this.handleShare.bind(this));
            });
        },
        
        handleShare(e) {
            e.preventDefault();
            const button = e.currentTarget;
            const url = button.getAttribute('href');
            
            const popup = window.open(
                url,
                'share',
                'width=600,height=400,scrollbars=no,resizable=no'
            );
            
            if (popup) {
                popup.focus();
            }
        }
    };
    
    // Initialize everything when DOM is ready
    function init() {
        readingProgress.init();
        mobileNav.init();
        newsletterForm.init();
        socialSharing.init();
        
        document.documentElement.classList.add('theme-loaded');
        
        const event = new CustomEvent('themeLoaded', {
            detail: { config, utils }
        });
        document.dispatchEvent(event);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Expose utilities
    window.SanneTheme = {
        config,
        utils,
        readingProgress,
        mobileNav,
        newsletterForm,
        socialSharing
    };
})();

// Global copy to clipboard function
function copyToClipboard(url) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function() {
            showCopyFeedback(event.target, 'Copied!');
        }).catch(function() {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
}

function fallbackCopyToClipboard(url) {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        document.execCommand('copy');
        showCopyFeedback(event.target, 'Copied!');
    } catch (err) {
        showCopyFeedback(event.target, 'Copy failed');
    }
    
    document.body.removeChild(textarea);
}

function showCopyFeedback(element, message) {
    const button = element.closest('.share-copy');
    if (!button) return;
    
    const textSpan = button.querySelector('span');
    if (!textSpan) return;
    
    const originalText = textSpan.textContent;
    textSpan.textContent = message;
    
    setTimeout(() => {
        textSpan.textContent = originalText;
    }, 2000);
}