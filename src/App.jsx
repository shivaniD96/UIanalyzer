import React, { useState, useCallback } from 'react';
import { Upload, X, Zap, BarChart3, Lightbulb, AlertTriangle, Trophy, ChevronDown, ChevronUp, Loader2, FolderOpen, Image, Code, FileCode, Eye, EyeOff, Github, Link, GitPullRequest } from 'lucide-react';

const ANALYSIS_PROMPT = `You are an expert UI/UX analyst specializing in A/B testing and conversion optimization. Analyze the provided UI variants and return a JSON response.

For each variant, evaluate:
1. Visual hierarchy and clarity
2. Call-to-action effectiveness
3. Trust signals and credibility
4. Cognitive load and usability
5. Mobile responsiveness indicators
6. Accessibility considerations
7. Emotional appeal and brand alignment
8. Code quality and maintainability (for code variants)
9. Component structure and reusability (for code variants)

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "variants": [
    {
      "id": 1,
      "name": "Variant A",
      "score": 85,
      "strengths": ["strength 1", "strength 2", "strength 3"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "conversionPotential": "high/medium/low",
      "targetAudience": "description of ideal audience",
      "codeQuality": "Only for code variants - assessment of code structure, readability, best practices"
    }
  ],
  "winner": {
    "id": 1,
    "reason": "Clear explanation of why this variant is recommended"
  },
  "comparison": {
    "visualHierarchy": "Comparison of visual hierarchy across variants",
    "ctaEffectiveness": "Comparison of CTAs",
    "trustSignals": "Comparison of trust elements",
    "userExperience": "Overall UX comparison",
    "codeArchitecture": "Only if code variants present - comparison of code structure and patterns"
  },
  "improvements": [
    {
      "variant": 1,
      "suggestion": "Specific actionable improvement",
      "impact": "high/medium/low",
      "effort": "high/medium/low"
    }
  ],
  "gaps": [
    {
      "issue": "Gap or missing element description",
      "affectedVariants": [1, 2],
      "recommendation": "How to address this gap"
    }
  ],
  "testingRecommendations": [
    "Recommendation 1 for A/B testing",
    "Recommendation 2 for A/B testing"
  ]
}`;

const UI_FILE_EXTENSIONS = ['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.css', '.scss', '.sass'];

export default function UIVariantAnalyzer() {
  const [variants, setVariants] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('screenshots');
  const [expandedCode, setExpandedCode] = useState({});
  const [repoUrl, setRepoUrl] = useState('');
  const [variantPath, setVariantPath] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    comparison: true,
    improvements: true,
    gaps: true,
    testing: false
  });

  const parseGitHubUrl = (url) => {
    // Check for PR URL first
    const prPattern = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
    const prMatch = url.match(prPattern);
    if (prMatch) {
      return {
        type: 'pr',
        owner: prMatch[1],
        repo: prMatch[2].replace('.git', ''),
        prNumber: prMatch[3]
      };
    }

    // Regular repo/branch URLs
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.*))?)?/,
      /github\.com\/([^\/]+)\/([^\/]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          type: 'repo',
          owner: match[1],
          repo: match[2].replace('.git', ''),
          branch: match[3] || 'main',
          path: match[4] || ''
        };
      }
    }
    return null;
  };

  const fetchPRBranches = async (owner, repo, prNumber, basePath) => {
    // Get PR details
    const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
    const prResponse = await fetch(prUrl);
    
    if (!prResponse.ok) {
      if (prResponse.status === 404) {
        throw new Error(`Pull Request #${prNumber} not found in ${owner}/${repo}`);
      }
      throw new Error(`GitHub API error: ${prResponse.status}`);
    }
    
    const prData = await prResponse.json();
    
    return {
      base: {
        branch: prData.base.ref,
        label: `Base (${prData.base.ref})`,
        sha: prData.base.sha
      },
      head: {
        branch: prData.head.ref,
        label: `PR #${prNumber} (${prData.head.ref})`,
        sha: prData.head.sha
      },
      title: prData.title,
      number: prData.number
    };
  };

  const fetchBranchFiles = async (owner, repo, branch, basePath) => {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl);
    
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch branch "${branch}": ${treeResponse.status}`);
    }
    
    const treeData = await treeResponse.json();
    
    const uiFiles = treeData.tree.filter(item => {
      if (item.type !== 'blob') return false;
      const ext = '.' + item.path.split('.').pop().toLowerCase();
      if (!UI_FILE_EXTENSIONS.includes(ext)) return false;
      if (basePath && !item.path.startsWith(basePath)) return false;
      if (item.path.includes('node_modules/') || item.path.includes('.git/') || 
          item.path.includes('dist/') || item.path.includes('build/')) return false;
      return true;
    });

    return uiFiles;
  };

  const fetchFileContents = async (owner, repo, files, branch, maxFiles = 15) => {
    const filesToFetch = files.slice(0, maxFiles);
    const fileContents = await Promise.all(
      filesToFetch.map(async (file) => {
        try {
          const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`;
          const contentResponse = await fetch(contentUrl);
          if (!contentResponse.ok) return null;
          
          const contentData = await contentResponse.json();
          const content = atob(contentData.content);
          
          return {
            name: file.path.split('/').pop(),
            path: file.path,
            content: content,
            extension: '.' + file.path.split('.').pop().toLowerCase()
          };
        } catch (e) {
          return null;
        }
      })
    );
    return fileContents.filter(f => f !== null);
  };

  const fetchGitHubRepo = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      setError('Invalid GitHub URL. Use format: https://github.com/owner/repo or https://github.com/owner/repo/pull/123');
      return;
    }

    setRepoLoading(true);
    setError(null);

    try {
      const { owner, repo } = parsed;
      const basePath = variantPath.trim() || (parsed.type === 'repo' ? parsed.path : '') || '';

      if (parsed.type === 'pr') {
        // Handle Pull Request URL - fetch both base and head branches as variants
        const prInfo = await fetchPRBranches(owner, repo, parsed.prNumber, basePath);
        
        // Fetch files from base branch (Variant A - current)
        const baseFiles = await fetchBranchFiles(owner, repo, prInfo.base.branch, basePath);
        if (baseFiles.length > 0) {
          const baseContents = await fetchFileContents(owner, repo, baseFiles, prInfo.base.branch);
          if (baseContents.length > 0) {
            setVariants(prev => [...prev, {
              id: Date.now() + Math.random(),
              name: `Variant ${String.fromCharCode(65 + prev.length)}`,
              folderName: prInfo.base.label,
              type: 'code',
              source: 'github-pr',
              repoInfo: { owner, repo, branch: prInfo.base.branch, prNumber: prInfo.number, prTitle: prInfo.title, isBase: true },
              files: baseContents
            }]);
          }
        }

        // Fetch files from head branch (Variant B - PR changes)
        const headFiles = await fetchBranchFiles(owner, repo, prInfo.head.branch, basePath);
        if (headFiles.length > 0) {
          const headContents = await fetchFileContents(owner, repo, headFiles, prInfo.head.branch);
          if (headContents.length > 0) {
            setVariants(prev => [...prev, {
              id: Date.now() + Math.random(),
              name: `Variant ${String.fromCharCode(65 + prev.length)}`,
              folderName: prInfo.head.label,
              type: 'code',
              source: 'github-pr',
              repoInfo: { owner, repo, branch: prInfo.head.branch, prNumber: prInfo.number, prTitle: prInfo.title, isBase: false },
              files: headContents
            }]);
          }
        }

        if (baseFiles.length === 0 && headFiles.length === 0) {
          throw new Error(`No UI files found in PR #${parsed.prNumber}${basePath ? ` at path "${basePath}"` : ''}. Looking for: ${UI_FILE_EXTENSIONS.join(', ')}`);
        }

      } else {
        // Handle regular repo URL
        const branch = parsed.branch;
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
        const treeResponse = await fetch(treeUrl);
        
        if (!treeResponse.ok) {
          if (treeResponse.status === 404) {
            throw new Error(`Repository not found or branch "${branch}" doesn't exist. Try specifying the correct branch.`);
          }
          throw new Error(`GitHub API error: ${treeResponse.status}`);
        }
        
        const treeData = await treeResponse.json();
        
        const uiFiles = treeData.tree.filter(item => {
          if (item.type !== 'blob') return false;
          const ext = '.' + item.path.split('.').pop().toLowerCase();
          if (!UI_FILE_EXTENSIONS.includes(ext)) return false;
          if (basePath && !item.path.startsWith(basePath)) return false;
          if (item.path.includes('node_modules/') || item.path.includes('.git/') || 
              item.path.includes('dist/') || item.path.includes('build/')) return false;
          return true;
        });

        if (uiFiles.length === 0) {
          throw new Error(`No UI files found in the repository${basePath ? ` at path "${basePath}"` : ''}. Looking for: ${UI_FILE_EXTENSIONS.join(', ')}`);
        }

        const folderGroups = {};
        uiFiles.forEach(file => {
          const relativePath = basePath ? file.path.replace(basePath + '/', '') : file.path;
          const parts = relativePath.split('/');
          
          let variantKey;
          if (parts.length > 1) {
            variantKey = parts[0];
          } else {
            variantKey = 'root';
          }
          
          if (!folderGroups[variantKey]) {
            folderGroups[variantKey] = [];
          }
          folderGroups[variantKey].push(file);
        });

        const MAX_FILES_PER_VARIANT = 10;
        const MAX_TOTAL_FILES = 30;
        let totalFetched = 0;

        for (const [folderName, files] of Object.entries(folderGroups)) {
          if (totalFetched >= MAX_TOTAL_FILES) break;
          
          const filesToFetch = files.slice(0, MAX_FILES_PER_VARIANT);
          const fileContents = await Promise.all(
            filesToFetch.map(async (file) => {
              if (totalFetched >= MAX_TOTAL_FILES) return null;
              totalFetched++;
              
              try {
                const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`;
                const contentResponse = await fetch(contentUrl);
                if (!contentResponse.ok) return null;
                
                const contentData = await contentResponse.json();
                const content = atob(contentData.content);
                
                return {
                  name: file.path.split('/').pop(),
                  path: file.path,
                  content: content,
                  extension: '.' + file.path.split('.').pop().toLowerCase()
                };
              } catch (e) {
                return null;
              }
            })
          );

          const validFiles = fileContents.filter(f => f !== null);
          if (validFiles.length > 0) {
            setVariants(prev => [...prev, {
              id: Date.now() + Math.random(),
              name: `Variant ${String.fromCharCode(65 + prev.length)}`,
              folderName: folderName,
              type: 'code',
              source: 'github',
              repoInfo: { owner, repo, branch },
              files: validFiles
            }]);
          }
        }
      }

      setRepoUrl('');
      setVariantPath('');
      
    } catch (err) {
      setError(err.message);
    } finally {
      setRepoLoading(false);
    }
  };

  const handleFileUpload = useCallback((e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setVariants(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: `Variant ${String.fromCharCode(65 + prev.length)}`,
          file: file.name,
          type: 'image',
          data: event.target.result,
          base64: event.target.result.split(',')[1]
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handleFolderUpload = useCallback((e) => {
    const files = Array.from(e.target.files);
    const folderGroups = {};
    
    files.forEach(file => {
      const pathParts = file.webkitRelativePath.split('/');
      if (pathParts.some(p => p === 'node_modules' || p === '.git' || p === 'dist' || p === 'build' || p.startsWith('.'))) {
        return;
      }
      
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!UI_FILE_EXTENSIONS.includes(ext)) return;
      
      let variantKey;
      if (pathParts.length > 2) {
        variantKey = pathParts[1];
      } else {
        variantKey = pathParts[0];
      }
      
      if (!folderGroups[variantKey]) {
        folderGroups[variantKey] = [];
      }
      folderGroups[variantKey].push(file);
    });

    Object.entries(folderGroups).forEach(([folderName, folderFiles]) => {
      const filePromises = folderFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              name: file.name,
              path: file.webkitRelativePath,
              content: event.target.result,
              extension: '.' + file.name.split('.').pop().toLowerCase()
            });
          };
          reader.readAsText(file);
        });
      });

      Promise.all(filePromises).then(fileContents => {
        setVariants(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: `Variant ${String.fromCharCode(65 + prev.length)}`,
          folderName: folderName,
          type: 'code',
          source: 'local',
          files: fileContents
        }]);
      });
    });
    
    e.target.value = '';
  }, []);

  const removeVariant = (id) => {
    setVariants(prev => prev.filter(v => v.id !== id));
    setAnalysis(null);
  };

  const toggleCodeExpand = (variantId, fileIndex) => {
    const key = `${variantId}-${fileIndex}`;
    setExpandedCode(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const analyzeVariants = async () => {
    if (variants.length < 2) {
      setError('Please upload at least 2 variants to compare');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const contentBlocks = [];
      
      variants.filter(v => v.type === 'image').forEach((v) => {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: v.data.includes('png') ? 'image/png' : 'image/jpeg',
            data: v.base64
          }
        });
      });
      
      const codeVariantsText = variants
        .filter(v => v.type === 'code')
        .map((v) => {
          const filesContent = v.files.map(f => 
            `--- File: ${f.path} ---\n${f.content}`
          ).join('\n\n');
          return `\n=== CODE VARIANT: ${v.name} (Folder: ${v.folderName}) ===\n${filesContent}`;
        }).join('\n\n');

      const variantDescriptions = variants.map((v) => {
        if (v.type === 'image') {
          return `${v.name}: Screenshot (${v.file})`;
        } else {
          let sourceInfo = '';
          if (v.source === 'github-pr') {
            sourceInfo = ` from GitHub PR #${v.repoInfo?.prNumber} (${v.repoInfo?.isBase ? 'base branch' : 'PR changes'})`;
          } else if (v.source === 'github') {
            sourceInfo = ` from GitHub ${v.repoInfo?.owner}/${v.repoInfo?.repo}`;
          }
          return `${v.name}: Code files from folder "${v.folderName}"${sourceInfo} (${v.files.length} files)`;
        }
      }).join(', ');

      contentBlocks.push({
        type: 'text',
        text: `${ANALYSIS_PROMPT}\n\nI'm providing ${variants.length} UI variants for A/B testing analysis:\n${variantDescriptions}\n\n${codeVariantsText}\n\nPlease analyze each variant and provide your comprehensive comparison. For code variants, analyze the UI that would be rendered and also comment on code quality.`
      });

      const messages = [{
        role: 'user',
        content: contentBlocks
      }];

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages
        })
      });

      const data = await response.json();
      const text = data.content?.find(c => c.type === 'text')?.text || '';
      
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedText);
      setAnalysis(parsed);
    } catch (err) {
      setError('Analysis failed. Please try again. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getImpactBadge = (impact) => {
    const colors = {
      high: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
      medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
      low: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80' }
    };
    return colors[impact] || colors.medium;
  };

  const getLanguageFromExt = (ext) => {
    const map = {
      '.html': 'html', '.htm': 'html',
      '.jsx': 'jsx', '.tsx': 'tsx',
      '.vue': 'vue', '.svelte': 'svelte',
      '.css': 'css', '.scss': 'scss', '.sass': 'sass',
      '.astro': 'astro'
    };
    return map[ext] || 'code';
  };

  const imageVariants = variants.filter(v => v.type === 'image');
  const codeVariants = variants.filter(v => v.type === 'code');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f12 0%, #1a1a24 50%, #0f0f12 100%)',
      color: '#e4e4e7',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '32px 24px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .glass-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          backdrop-filter: blur(20px);
        }
        .upload-zone {
          border: 2px dashed rgba(139, 92, 246, 0.3);
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .upload-zone:hover {
          border-color: rgba(139, 92, 246, 0.6);
          background: rgba(139, 92, 246, 0.05);
        }
        .upload-zone-folder {
          border-color: rgba(16, 185, 129, 0.3);
        }
        .upload-zone-folder:hover {
          border-color: rgba(16, 185, 129, 0.6);
          background: rgba(16, 185, 129, 0.05);
        }
        .variant-card {
          transition: all 0.3s ease;
        }
        .variant-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .score-ring {
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .winner-badge {
          animation: glow 2s ease-in-out infinite;
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
          50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.5); }
        }
        .section-toggle {
          transition: all 0.2s ease;
        }
        .section-toggle:hover {
          background: rgba(255,255,255,0.05);
        }
        .analyze-btn {
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          transition: all 0.3s ease;
        }
        .analyze-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        .analyze-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .tab-btn {
          transition: all 0.2s ease;
          background: transparent;
          border: none;
          padding: 12px 20px;
          cursor: pointer;
          border-radius: 8px 8px 0 0;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tab-btn.active {
          background: rgba(255,255,255,0.05);
          color: #fff;
        }
        .tab-btn:not(.active) {
          color: #71717a;
        }
        .tab-btn:hover:not(.active) {
          color: #a1a1aa;
          background: rgba(255,255,255,0.02);
        }
        .code-block {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          line-height: 1.5;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          padding: 12px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
          color: #a1a1aa;
          max-height: 200px;
          overflow-y: auto;
        }
        .code-block.expanded {
          max-height: 500px;
        }
        .file-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(99, 102, 241, 0.15);
          border-radius: 6px;
          font-size: 11px;
          color: #818cf8;
          font-family: 'JetBrains Mono', monospace;
        }
        .github-input {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 14px 16px;
          color: #e4e4e7;
          font-size: 14px;
          width: 100%;
          outline: none;
          transition: all 0.2s ease;
        }
        .github-input:focus {
          border-color: rgba(139, 92, 246, 0.5);
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }
        .github-input::placeholder {
          color: #52525b;
        }
        .fetch-btn {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 10px;
          padding: 14px 24px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .fetch-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
        }
        .fetch-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .source-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .source-badge.github {
          background: rgba(139, 92, 246, 0.15);
          color: #a78bfa;
        }
        .source-badge.github-pr {
          background: rgba(236, 72, 153, 0.15);
          color: #f472b6;
        }
        .source-badge.local {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
        }
        .pr-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(236, 72, 153, 0.1);
          border: 1px solid rgba(236, 72, 153, 0.2);
          border-radius: 8px;
          font-size: 12px;
          color: #f472b6;
          margin-bottom: 8px;
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '8px 16px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '100px', marginBottom: '16px' }}>
            <Zap size={18} color="#a78bfa" />
            <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 500, letterSpacing: '0.5px' }}>AI-POWERED ANALYSIS</span>
          </div>
          <h1 style={{ fontSize: '42px', fontWeight: 700, margin: '0 0 12px 0', background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            UI Variant Analyzer
          </h1>
          <p style={{ fontSize: '16px', color: '#71717a', maxWidth: '600px', margin: '0 auto' }}>
            Paste a GitHub repo URL, upload screenshots, or select local folders with your A/B test variants for instant AI-powered analysis.
          </p>
        </div>

        <div className="glass-card" style={{ marginBottom: '32px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
            <button className={`tab-btn ${activeTab === 'screenshots' ? 'active' : ''}`} onClick={() => setActiveTab('screenshots')}>
              <Image size={16} />Screenshots
              {imageVariants.length > 0 && <span style={{ background: 'rgba(139, 92, 246, 0.3)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>{imageVariants.length}</span>}
            </button>
            <button className={`tab-btn ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')}>
              <Github size={16} />GitHub Repo
            </button>
            <button className={`tab-btn ${activeTab === 'local' ? 'active' : ''}`} onClick={() => setActiveTab('local')}>
              <FolderOpen size={16} />Local Folder
            </button>
            {codeVariants.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', marginRight: '16px', background: 'rgba(16, 185, 129, 0.2)', padding: '4px 12px', borderRadius: '10px', fontSize: '12px', color: '#34d399' }}>
                <Code size={14} style={{ marginRight: '6px' }} />{codeVariants.length} code variant{codeVariants.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ padding: '24px' }}>
            {activeTab === 'screenshots' && (
              <>
                <label className="upload-zone" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', borderRadius: '12px', marginBottom: imageVariants.length > 0 ? '24px' : 0 }}>
                  <input type="file" accept="image/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                  <Image size={32} color="#8b5cf6" style={{ marginBottom: '16px' }} />
                  <span style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>Drop UI screenshots here or click to upload</span>
                  <span style={{ fontSize: '13px', color: '#71717a' }}>PNG, JPG up to 10MB each</span>
                </label>
                {imageVariants.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                    {imageVariants.map((variant) => (
                      <div key={variant.id} className="variant-card glass-card" style={{ padding: '12px', position: 'relative' }}>
                        <button onClick={() => removeVariant(variant.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', zIndex: 10 }}>
                          <X size={14} color="#f87171" />
                        </button>
                        <img src={variant.data} alt={variant.name} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} />
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{variant.name}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>{variant.file}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'github' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '12px', marginBottom: '20px' }}>
                  <Github size={20} color="#a78bfa" />
                  <span style={{ fontSize: '14px', color: '#a1a1aa' }}>Enter a GitHub repo URL or <span style={{ color: '#f472b6' }}>Pull Request URL</span>. For PRs, both base and head branches are fetched as separate variants for comparison.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <label style={{ fontSize: '12px', color: '#71717a', marginBottom: '6px', display: 'block' }}>Repository URL *</label>
                      <input type="text" className="github-input" placeholder="https://github.com/username/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchGitHubRepo()} />
                    </div>
                    <div style={{ flex: '0 1 200px' }}>
                      <label style={{ fontSize: '12px', color: '#71717a', marginBottom: '6px', display: 'block' }}>Variants Path (optional)</label>
                      <input type="text" className="github-input" placeholder="src/variants" value={variantPath} onChange={(e) => setVariantPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchGitHubRepo()} />
                    </div>
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
                      <button className="fetch-btn" onClick={fetchGitHubRepo} disabled={repoLoading || !repoUrl.trim()}>
                        {repoLoading ? (<><Loader2 size={16} className="spinner" />Fetching...</>) : (<><Link size={16} />Fetch Repo</>)}
                      </button>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '12px', color: '#71717a' }}>
                  <strong style={{ color: '#a1a1aa' }}>Supported URL formats:</strong>
                  <div style={{ marginTop: '6px', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                    • https://github.com/owner/repo<br/>• https://github.com/owner/repo/tree/branch<br/>• https://github.com/owner/repo/tree/branch/path<br/>• <span style={{ color: '#f472b6' }}>https://github.com/owner/repo/pull/123</span> <span style={{ color: '#71717a' }}>(auto-compares base vs PR)</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'local' && (
              <label className="upload-zone upload-zone-folder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', borderRadius: '12px' }}>
                <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} style={{ display: 'none' }} />
                <FolderOpen size={32} color="#10b981" style={{ marginBottom: '16px' }} />
                <span style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>Upload a local folder containing UI variants</span>
                <span style={{ fontSize: '13px', color: '#71717a', textAlign: 'center', maxWidth: '400px' }}>
                  Select a folder with subfolders for each variant<br /><span style={{ color: '#10b981' }}>Supports: HTML, JSX, TSX, Vue, Svelte, CSS, SCSS</span>
                </span>
              </label>
            )}

            {codeVariants.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Code size={14} />Code Variants ({codeVariants.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {codeVariants.map((variant) => (
                    <div key={variant.id} className="variant-card glass-card" style={{ padding: '16px', position: 'relative' }}>
                      <button onClick={() => removeVariant(variant.id)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', zIndex: 10 }}>
                        <X size={14} color="#f87171" />
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: variant.source === 'github-pr' ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(219, 39, 119, 0.2) 100%)' : variant.source === 'github' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 95, 70, 0.2) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {variant.source === 'github-pr' ? <GitPullRequest size={20} color="#f472b6" /> : variant.source === 'github' ? <Github size={20} color="#a78bfa" /> : <FolderOpen size={20} color="#10b981" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{variant.name}</span>
                            <span className={`source-badge ${variant.source}`}>
                              {variant.source === 'github-pr' ? '🔀 PR' : variant.source === 'github' ? <Github size={10} /> : <FolderOpen size={10} />}
                              {variant.source === 'github-pr' ? (variant.repoInfo?.isBase ? 'base' : 'changes') : variant.source}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#71717a' }}>
                            {variant.source === 'github-pr' && variant.repoInfo && (
                              <span>{variant.repoInfo.owner}/{variant.repoInfo.repo} • PR #{variant.repoInfo.prNumber} • </span>
                            )}
                            {variant.source === 'github' && variant.repoInfo && (
                              <span>{variant.repoInfo.owner}/{variant.repoInfo.repo} • </span>
                            )}
                            Folder: {variant.folderName} • {variant.files.length} file{variant.files.length !== 1 ? 's' : ''}
                          </div>
                          {variant.source === 'github-pr' && variant.repoInfo?.prTitle && (
                            <div style={{ fontSize: '11px', color: '#f472b6', marginTop: '4px', fontStyle: 'italic' }}>
                              "{variant.repoInfo.prTitle}"
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {variant.files.map((file, fileIndex) => (
                          <div key={fileIndex} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <FileCode size={14} color="#71717a" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
                                <span className="file-badge" style={{ flexShrink: 0 }}>{getLanguageFromExt(file.extension)}</span>
                              </div>
                              <button onClick={() => toggleCodeExpand(variant.id, fileIndex)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontSize: '11px', flexShrink: 0 }}>
                                {expandedCode[`${variant.id}-${fileIndex}`] ? <><EyeOff size={14} /> Collapse</> : <><Eye size={14} /> Expand</>}
                              </button>
                            </div>
                            <pre className={`code-block ${expandedCode[`${variant.id}-${fileIndex}`] ? 'expanded' : ''}`}>
                              {file.content.slice(0, expandedCode[`${variant.id}-${fileIndex}`] ? 10000 : 500)}
                              {file.content.length > 500 && !expandedCode[`${variant.id}-${fileIndex}`] && '...'}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {variants.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: '#71717a' }}>Total Variants:</span>
              <span style={{ fontSize: '20px', fontWeight: 700, background: 'linear-gradient(135deg, #fff 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{variants.length}</span>
              {imageVariants.length > 0 && <span style={{ fontSize: '13px', color: '#8b5cf6' }}>{imageVariants.length} screenshot{imageVariants.length !== 1 ? 's' : ''}</span>}
              {codeVariants.length > 0 && <span style={{ fontSize: '13px', color: '#10b981' }}>{codeVariants.length} code variant{codeVariants.length !== 1 ? 's' : ''}</span>}
            </div>
            <button onClick={() => { setVariants([]); setAnalysis(null); }} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '8px 16px', color: '#f87171', fontSize: '13px', cursor: 'pointer' }}>Clear All</button>
          </div>
        )}

        <button className="analyze-btn" onClick={analyzeVariants} disabled={variants.length < 2 || loading} style={{ width: '100%', padding: '18px', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '32px' }}>
          {loading ? (<><Loader2 size={20} className="spinner" />Analyzing variants...</>) : (<><BarChart3 size={20} />Analyze {variants.length} Variant{variants.length !== 1 ? 's' : ''}</>)}
        </button>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', marginBottom: '32px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={20} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ color: '#f87171' }}>{error}</span>
          </div>
        )}

        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {analysis.winner && (
              <div className="winner-badge glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trophy size={28} color="#1a1a24" />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: 500, marginBottom: '4px' }}>RECOMMENDED WINNER</div>
                    <div style={{ fontSize: '20px', fontWeight: 700 }}>Variant {String.fromCharCode(64 + analysis.winner.id)}</div>
                  </div>
                </div>
                <p style={{ marginTop: '16px', color: '#a1a1aa', lineHeight: 1.6 }}>{analysis.winner.reason}</p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {analysis.variants?.map((v) => (
                <div key={v.id} className="glass-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{v.name}</div>
                      <div style={{ fontSize: '13px', color: '#71717a', marginTop: '2px' }}>{v.conversionPotential?.toUpperCase()} conversion potential</div>
                    </div>
                    <div className="score-ring" style={{ width: '64px', height: '64px', borderRadius: '50%', border: `4px solid ${getScoreColor(v.score)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '20px', fontWeight: 600, color: getScoreColor(v.score), flexShrink: 0 }}>{v.score}</div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '8px', fontWeight: 500 }}>STRENGTHS</div>
                    {v.strengths?.map((s, j) => (<div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px', fontSize: '13px', color: '#a1a1aa' }}><span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{s}</div>))}
                  </div>
                  <div style={{ marginBottom: v.codeQuality ? '16px' : 0 }}>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '8px', fontWeight: 500 }}>WEAKNESSES</div>
                    {v.weaknesses?.map((w, j) => (<div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px', fontSize: '13px', color: '#a1a1aa' }}><span style={{ color: '#ef4444', flexShrink: 0 }}>✗</span>{w}</div>))}
                  </div>
                  {v.codeQuality && (<div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#818cf8', marginBottom: '16px' }}><strong>Code Quality:</strong> {v.codeQuality}</div>)}
                  {v.targetAudience && (<div style={{ padding: '12px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#a78bfa' }}><strong>Target:</strong> {v.targetAudience}</div>)}
                </div>
              ))}
            </div>

            {analysis.comparison && (
              <div className="glass-card">
                <button className="section-toggle" onClick={() => toggleSection('comparison')} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><BarChart3 size={20} color="#8b5cf6" /><span style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>Detailed Comparison</span></div>
                  {expandedSections.comparison ? <ChevronUp size={20} color="#71717a" /> : <ChevronDown size={20} color="#71717a" />}
                </button>
                {expandedSections.comparison && (
                  <div style={{ padding: '0 24px 24px', display: 'grid', gap: '16px' }}>
                    {Object.entries(analysis.comparison).map(([key, value]) => (
                      <div key={key} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.6 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {analysis.improvements?.length > 0 && (
              <div className="glass-card">
                <button className="section-toggle" onClick={() => toggleSection('improvements')} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><Lightbulb size={20} color="#fbbf24" /><span style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>Improvement Suggestions</span></div>
                  {expandedSections.improvements ? <ChevronUp size={20} color="#71717a" /> : <ChevronDown size={20} color="#71717a" />}
                </button>
                {expandedSections.improvements && (
                  <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {analysis.improvements.map((imp, i) => (
                      <div key={i} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ padding: '6px 10px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#a78bfa', whiteSpace: 'nowrap', flexShrink: 0 }}>Variant {String.fromCharCode(64 + imp.variant)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', color: '#e4e4e7', marginBottom: '8px' }}>{imp.suggestion}</div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: getImpactBadge(imp.impact).bg, color: getImpactBadge(imp.impact).text }}>Impact: {imp.impact}</span>
                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: 'rgba(113, 113, 122, 0.2)', color: '#a1a1aa' }}>Effort: {imp.effort}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {analysis.gaps?.length > 0 && (
              <div className="glass-card">
                <button className="section-toggle" onClick={() => toggleSection('gaps')} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><AlertTriangle size={20} color="#f87171" /><span style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>Identified Gaps</span></div>
                  {expandedSections.gaps ? <ChevronUp size={20} color="#71717a" /> : <ChevronDown size={20} color="#71717a" />}
                </button>
                {expandedSections.gaps && (
                  <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {analysis.gaps.map((gap, i) => (
                      <div key={i} style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginBottom: '8px' }}>{gap.issue}</div>
                        <div style={{ fontSize: '13px', color: '#71717a', marginBottom: '8px' }}>Affects: {gap.affectedVariants?.map(v => `Variant ${String.fromCharCode(64 + v)}`).join(', ')}</div>
                        <div style={{ fontSize: '13px', color: '#a1a1aa' }}><strong style={{ color: '#10b981' }}>Recommendation:</strong> {gap.recommendation}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {analysis.testingRecommendations?.length > 0 && (
              <div className="glass-card">
                <button className="section-toggle" onClick={() => toggleSection('testing')} style={{ width: '100%', padding: '20px 24px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><Zap size={20} color="#10b981" /><span style={{ fontSize: '16px', fontWeight: 600, color: '#e4e4e7' }}>A/B Testing Recommendations</span></div>
                  {expandedSections.testing ? <ChevronUp size={20} color="#71717a" /> : <ChevronDown size={20} color="#71717a" />}
                </button>
                {expandedSections.testing && (
                  <div style={{ padding: '0 24px 24px' }}>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {analysis.testingRecommendations.map((rec, i) => (<li key={i} style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.6 }}>{rec}</li>))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
