# Sanne Ghost Theme

A premium Ghost theme inspired by Sanne de Vries' clean and modern design philosophy, featuring semantic HTML5 structure, comprehensive SEO optimization, and elegant social sharing functionality.

## 🎆 Features

### 🎨 Design & User Experience
- **Clean, minimal aesthetic** inspired by Sanne de Vries' design approach
- **Responsive design** that works beautifully on all devices
- **Typography-focused** layout with excellent readability
- **Dark mode support** with system preference detection
- **Reading progress indicator** for long-form content
- **Smooth animations** and micro-interactions

### 🔍 SEO & Performance
- **Semantic HTML5** structure for better SEO
- **Structured data** (JSON-LD schema) for rich snippets
- **Open Graph** and **Twitter Card** meta tags
- **Optimized images** with responsive sizing
- **Fast loading** with minimal JavaScript
- **Core Web Vitals** optimized

### 📱 Social & Engagement
- **Social sharing buttons** (Twitter, Facebook, LinkedIn, Copy Link)
- **Newsletter subscription** integration
- **Author profiles** with rich information
- **Tag and category** archives
- **Related posts** suggestions

### ♿ Accessibility
- **WCAG 2.1 AA compliant**
- **Keyboard navigation** support
- **Screen reader** optimized
- **Focus management** and indicators
- **High contrast** mode support
- **Reduced motion** preferences respected

## 🛠️ Installation

### Method 1: Direct Upload
1. Download the latest release from [GitHub Releases](https://github.com/anbarci/sanne-ghost-theme/releases)
2. Extract the ZIP file
3. Navigate to your Ghost admin panel → Design → Upload theme
4. Upload the theme ZIP file
5. Activate the theme

### Method 2: Development Setup
```bash
# Clone the repository
git clone https://github.com/anbarci/sanne-ghost-theme.git
cd sanne-ghost-theme

# Install dependencies
npm install

# Build the theme
npm run build

# Create distribution package
npm run zip
```

## 🎨 Customization

### Theme Settings
The theme includes several customization options available in Ghost Admin → Design → Theme settings:

- **Navigation Layout**: Clean minimal, Logo centered, Full navigation
- **Typography Style**: Modern sans-serif, Elegant serif, Mixed styles
- **Color Scheme**: Light theme, Dark theme, Auto (system preference)
- **Social Sharing**: Enable/disable social share buttons
- **Reading Progress**: Show/hide reading progress bar

### CSS Custom Properties
The theme uses CSS custom properties for easy customization:

```css
:root {
  /* Brand Colors */
  --brand-primary: #1a1a1a;
  --brand-secondary: #4a5568;
  --brand-accent: #2563eb;
  
  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Crimson Text', Georgia, serif;
  
  /* Spacing */
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  
  /* And many more... */
}
```

### Navigation Setup
1. Go to Ghost Admin → Design → Navigation
2. Add your menu items
3. For secondary footer navigation, use the "Secondary Navigation" section

### Social Media Links
1. Go to Ghost Admin → Settings → General
2. Add your social media URLs in the "Social accounts" section
3. The theme will automatically display them in the footer

## 📄 Content Guidelines

### Post Types
The theme supports all Ghost content types:
- **Posts**: Blog articles with full feature set
- **Pages**: Static content pages
- **Authors**: Author profile pages
- **Tags**: Tag archive pages

### Featured Images
- **Recommended size**: 1600x900px (16:9 aspect ratio)
- **Format**: JPEG or WebP for best performance
- **Alt text**: Always include for accessibility

### Author Profiles
For best results with author pages:
- Add a high-quality profile image (400x400px minimum)
- Write a compelling bio (150-300 characters)
- Include location and website if relevant

## 🚀 Performance

### Optimization Features
- **Lazy loading** for images
- **Minified CSS and JavaScript**
- **Efficient font loading**
- **Optimized animations**
- **Service worker** ready (can be added)

### Lighthouse Scores
The theme is optimized to achieve:
- **Performance**: 95+
- **Accessibility**: 100
- **Best Practices**: 100
- **SEO**: 100

## 🔧 Development

### Prerequisites
- Node.js 16+
- Ghost CLI (for local development)
- Git

### Development Workflow
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run GScan (Ghost theme validator)
npm run test

# Create distribution package
npm run zip
```

### File Structure
```
sanne-ghost-theme/
├── assets/
│   ├── css/           # Source CSS files
│   ├── js/            # JavaScript files
│   └── built/         # Compiled assets
├── partials/
│   ├── navigation.hbs # Navigation component
│   └── footer.hbs     # Footer component
├── default.hbs        # Base template
├── index.hbs          # Homepage template
├── post.hbs           # Post template
├── page.hbs           # Page template
├── author.hbs         # Author template
├── tag.hbs            # Tag template
├── error.hbs          # Error template
├── package.json       # Theme configuration
└── gulpfile.js        # Build configuration
```

## 🌍 Browser Support

- **Chrome**: Latest 2 versions
- **Firefox**: Latest 2 versions
- **Safari**: Latest 2 versions
- **Edge**: Latest 2 versions
- **iOS Safari**: iOS 12+
- **Android Chrome**: Android 8+

## 📝 License

This theme is released under the MIT License. See [LICENSE](LICENSE) for details.

## 🚑 Support

### Documentation
- [Ghost Theme Documentation](https://ghost.org/docs/themes/)
- [Theme Customization Guide](https://github.com/anbarci/sanne-ghost-theme/wiki/customization)

### Issues & Feature Requests
Please use the [GitHub Issues](https://github.com/anbarci/sanne-ghost-theme/issues) page to:
- Report bugs
- Request new features
- Ask questions
- Share feedback

### Contributing
Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

## 💫 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes in each version.

## 🙏 Acknowledgments

- **Sanne de Vries** - Design inspiration from her beautiful work at Ghost
- **Ghost Foundation** - For the amazing publishing platform
- **Inter Font** - By Rasmus Andersson
- **Crimson Text** - By Sebastian Kosch

---

**Made with ❤️ by [Hikmet Anbarçı](https://github.com/anbarci)**

If you find this theme useful, please consider giving it a ⭐ on GitHub!