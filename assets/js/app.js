/**
 * Sanne Ghost Theme JavaScript
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
        
        // Check if element is in viewport
        isInViewport(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        },
        
        // Smooth scroll to element
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
            updateProgress(); // Initial call
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
            
            // Handle window resize
            window.addEventListener('resize', utils.debounce(() => {
                if (window.innerWidth > 768) {
                    this.closeMenu();
                }
            }, 250));
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
            
            // Focus management
            if (!isOpen) {
                const firstLink = mobileMenu.querySelector('.mobile-nav-link');
                if (firstLink) firstLink.focus();
            }
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
    
    // Lazy loading for images
    const lazyLoading = {
        init() {
            if (!config.enableLazyLoading || !('IntersectionObserver' in window)) return;
            
            const images = document.querySelectorAll('img[loading="lazy"]');
            if (images.length === 0) return;
            
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.classList.add('loaded');
                        observer.unobserve(img);
                    }
                });
            }, {
                rootMargin: '50px 0px'
            });
            
            images.forEach(img => imageObserver.observe(img));
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
            
            // Ghost Members API would handle this in a real implementation
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
            // Clear previous states
            form.classList.remove('success', 'error');
            
            // Add new state
            form.classList.add(type);
            
            // Auto-hide after 5 seconds
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
            
            // Open in popup window
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
    
    // Copy to clipboard functionality
    const copyToClipboard = {
        init() {
            // This function is already defined in post.hbs template
            // but we can enhance it here if needed
        }
    };
    
    // Dark mode toggle (if implemented)
    const darkMode = {
        init() {
            if (!config.enableDarkMode) return;
            
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
            const storedTheme = localStorage.getItem('theme');
            
            // Set initial theme
            if (storedTheme) {
                document.documentElement.setAttribute('data-theme', storedTheme);
            } else {
                document.documentElement.setAttribute('data-theme', 'auto');
            }
            
            // Listen for system theme changes
            prefersDark.addEventListener('change', (e) => {
                if (document.documentElement.getAttribute('data-theme') === 'auto') {
                    this.updateAutoTheme();
                }
            });
        },
        
        updateAutoTheme() {
            // This would update the theme based on system preference
            // Implementation depends on your theme switching logic
        }
    };
    
    // Smooth scroll for anchor links
    const smoothScroll = {
        init() {
            if (!config.enableSmoothScroll) return;
            
            const anchors = document.querySelectorAll('a[href^="#"]');
            anchors.forEach(anchor => {
                anchor.addEventListener('click', this.handleClick.bind(this));
            });
        },
        
        handleClick(e) {
            e.preventDefault();
            const targetId = e.currentTarget.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                utils.scrollToElement(targetElement, 100);
                
                // Update URL without triggering scroll
                history.replaceState(null, null, `#${targetId}`);
                
                // Focus management for accessibility
                targetElement.setAttribute('tabindex', '-1');
                targetElement.focus();
            }
        }
    };
    
    // Performance monitoring
    const performance = {
        init() {
            // Monitor Core Web Vitals if supported
            if ('web-vitals' in window) {
                // This would use the web-vitals library to monitor performance
            }
            
            // Basic performance logging
            window.addEventListener('load', () => {
                const loadTime = performance.now();
                console.log(`Theme loaded in ${loadTime.toFixed(2)}ms`);
            });
        }
    };
    
    // Accessibility enhancements
    const accessibility = {
        init() {
            this.setupFocusVisible();
            this.setupSkipLink();
            this.setupKeyboardNavigation();
        },
        
        setupFocusVisible() {
            // Add focus-visible polyfill behavior
            let hadKeyboardEvent = true;
            const keyboardThrottleTimeout = 100;
            let keyboardThrottleTimeoutID = 0;
            
            function onPointerDown() {
                hadKeyboardEvent = false;
            }
            
            function onKeyDown(e) {
                if (e.metaKey || e.altKey || e.ctrlKey) {
                    return;
                }
                hadKeyboardEvent = true;
            }
            
            function onFocus(e) {
                if (hadKeyboardEvent || e.target.matches(':focus-visible')) {
                    e.target.classList.add('focus-visible');
                }
            }
            
            function onBlur(e) {
                e.target.classList.remove('focus-visible');
            }
            
            document.addEventListener('keydown', onKeyDown, true);
            document.addEventListener('mousedown', onPointerDown, true);
            document.addEventListener('pointerdown', onPointerDown, true);
            document.addEventListener('touchstart', onPointerDown, true);
            document.addEventListener('focus', onFocus, true);
            document.addEventListener('blur', onBlur, true);
        },
        
        setupSkipLink() {
            const skipLink = document.querySelector('.skip-link');
            if (skipLink) {
                skipLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = document.querySelector(skipLink.getAttribute('href'));
                    if (target) {
                        target.focus();
                        utils.scrollToElement(target);
                    }
                });
            }
        },
        
        setupKeyboardNavigation() {
            // Enhanced keyboard navigation for complex components
            document.addEventListener('keydown', (e) => {
                // Handle escape key globally
                if (e.key === 'Escape') {
                    const activeElement = document.activeElement;
                    if (activeElement && activeElement.blur) {
                        activeElement.blur();
                    }
                }
            });
        }
    };
    
    // Initialize everything when DOM is ready
    function init() {
        // Core functionality
        readingProgress.init();
        mobileNav.init();
        lazyLoading.init();
        newsletterForm.init();
        socialSharing.init();
        copyToClipboard.init();
        smoothScroll.init();
        darkMode.init();
        accessibility.init();
        performance.init();
        
        // Mark theme as loaded
        document.documentElement.classList.add('theme-loaded');
        
        // Dispatch custom event for other scripts
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
    
    // Expose utilities for other scripts
    window.SanneTheme = {
        config,
        utils,
        readingProgress,
        mobileNav,
        lazyLoading,
        newsletterForm,
        socialSharing,
        darkMode,
        smoothScroll,
        accessibility
    };
})();

// Global copy to clipboard function (for inline usage)
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