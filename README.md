# UI Variant Analyzer

An AI-powered tool for analyzing and comparing UI variants for A/B testing. Upload screenshots, paste GitHub repo URLs, or analyze Pull Requests to get instant insights on which design performs better.

![UI Variant Analyzer](https://img.shields.io/badge/AI-Powered-8b5cf6?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-4-646cff?style=for-the-badge&logo=vite)

## ✨ Features

### Multiple Input Methods
- **📸 Screenshots** - Upload UI screenshots directly
- **🔗 GitHub Repos** - Paste a repo URL to fetch UI code files
- **🔀 Pull Requests** - Compare base branch vs PR changes automatically

### AI-Powered Analysis
- **Scoring** - Each variant gets a 0-100 score
- **Winner Selection** - AI recommends the best variant with reasoning
- **Strengths & Weaknesses** - Detailed breakdown for each variant
- **Code Quality** - For code variants, includes code structure assessment
- **Improvement Suggestions** - Actionable fixes with impact/effort ratings
- **Gap Analysis** - Missing elements across all variants
- **A/B Testing Recommendations** - Specific advice for running tests

### What Gets Analyzed
- Visual hierarchy and clarity
- Call-to-action effectiveness
- Trust signals and credibility
- Cognitive load and usability
- Mobile responsiveness indicators
- Accessibility considerations
- Emotional appeal and brand alignment
- Code quality (for code variants)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Anthropic API key (for Claude AI analysis)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ui-variant-analyzer.git
cd ui-variant-analyzer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

The app uses the Anthropic API directly from the browser. For production use, you should:

1. Set up a backend proxy to handle API calls securely
2. Or use environment variables with a serverless function

## 📖 Usage

### Analyzing Screenshots

1. Go to the **Screenshots** tab
2. Upload 2+ UI screenshots (PNG, JPG)
3. Click **Analyze Variants**

### Analyzing GitHub Repos

1. Go to the **GitHub Repo** tab
2. Paste a repository URL:
   - `https://github.com/owner/repo`
   - `https://github.com/owner/repo/tree/branch`
   - `https://github.com/owner/repo/tree/branch/path/to/variants`
3. Optionally specify a path to filter files
4. Click **Fetch Repo**
5. Click **Analyze Variants**

### Analyzing Pull Requests

1. Go to the **GitHub Repo** tab
2. Paste a PR URL: `https://github.com/owner/repo/pull/123`
3. The tool automatically fetches:
   - **Variant A**: Base branch (current code)
   - **Variant B**: PR branch (proposed changes)
4. Click **Analyze Variants**

### Supported File Types

For code analysis, the tool looks for:
- `.html`, `.htm`
- `.jsx`, `.tsx`
- `.vue`
- `.svelte`
- `.astro`
- `.css`, `.scss`, `.sass`

## 🏗️ Project Structure

```
ui-variant-analyzer/
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML entry point
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind CSS config
├── postcss.config.js    # PostCSS config
└── package.json
```

## 🛠️ Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Claude AI (Anthropic)** - AI analysis
- **GitHub API** - Repository/PR fetching

## 📝 API Usage Notes

### GitHub API
- Uses public GitHub API (no auth required for public repos)
- Rate limit: 60 requests/hour for unauthenticated requests
- For private repos, add a personal access token

### Anthropic API
- Requires API key
- Uses Claude Sonnet model for analysis
- Supports image + text multimodal inputs

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for Claude AI
- [Lucide](https://lucide.dev) for beautiful icons
- [Vite](https://vitejs.dev) for the blazing fast build tool
