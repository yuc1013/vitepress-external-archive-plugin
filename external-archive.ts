import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import puppeteer, { Browser } from 'puppeteer'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ARCHIVE_DIR = 'docs/public/archives'
const CONCURRENCY = 5        // 并发抓取数量
const PAGE_TIMEOUT = 30_000  // 单页抓取超时 30s

function isExternalLink(href: string): boolean {
  if (!href) return false
  return /^https?:\/\//.test(href)
}

function sanitizeFileName(url: string) {
  const hash = crypto.createHash('md5').update(url).digest('hex')
  return `${hash}.html`
}

// 用 Puppeteer 抓取单个页面
async function fetchPage(browser: Browser, href: string): Promise<string | null> {
  let page
  try {
    page = await browser.newPage()
    await page.goto(href, { waitUntil: 'networkidle0', timeout: PAGE_TIMEOUT })
    return await page.content()
  } catch (err) {
    console.error(`抓取失败: ${href}`, err)
    return null
  } finally {
    if (page) await page.close()
  }
}

export async function generateArchiveIncremental(mdDir: string) {
  const browser = await puppeteer.launch()

  // 收集所有外链
  const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'))
  const externalLinks = new Set<string>()

  for (const file of mdFiles) {
    const content = fs.readFileSync(path.join(mdDir, file), 'utf-8')
    const linkRegex = /\[.*?\]\((.*?)\)/g
    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1].trim()
      if (isExternalLink(href)) externalLinks.add(href)
    }
  }

  const linksArray = Array.from(externalLinks)

  for (let i = 0; i < linksArray.length; i += CONCURRENCY) {
    const batch = linksArray.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async href => {
        const fileName = sanitizeFileName(href)
        const filePath = path.join(ARCHIVE_DIR, fileName)

        // 已存在直接跳过
        if (fs.existsSync(filePath)) return

        const html = await fetchPage(browser, href)
        if (html) {
          fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
          fs.writeFileSync(filePath, html, 'utf-8')
          console.log(`生成存档: ${href}`)
        }
      })
    )
  }

  await browser.close()
  console.log(`外链存档生成完成，共 ${linksArray.length} 条`)
}

// 辅助函数：查找匹配的 link_open token
function findMatchingLinkOpen(tokens: Token[], closeIndex: number): Token | undefined {
  let level = 1;
  // 从 link_close token 之前开始向前遍历
  for (let i = closeIndex - 1; i >= 0; i--) {
    const token = tokens[i];

    // 如果是另一个 link_close token，说明我们进入了嵌套链接，需要跳过它
    if (token.type === 'link_close') {
      level++;
    }
    
    // 如果是 link_open token
    if (token.type === 'link_open') {
      level--;
      // 当 level 归零时，找到匹配的 link_open
      if (level === 0) {
        return token;
      }
    }
  }
  return undefined; // 找不到（理论上不应该发生）
}

function externalArchivePlugin(md: MarkdownIt): void {
  const ICON_HTML = '📦';
  
  // 保持默认渲染器不变
  const defaultRender = md.renderer.rules.link_close || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  
  md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
    
    // 1. 使用安全方法找到匹配的 link_open token
    const openToken = findMatchingLinkOpen(tokens, idx);

    if (!openToken) {
      // 如果找不到 openToken，直接返回默认渲染
      return defaultRender(tokens, idx, options, env, self);
    }
    
    const href = openToken.attrGet('href');
    console.log('Processing link:', href); // 调试时现在应该看到正确的 href

    if (href && isExternalLink(href)) {
      
      // 检查辅助函数是否存在（防止 ReferenceError）
      if (typeof sanitizeFileName !== 'function') {
        console.error('sanitizeFileName is not defined!');
        return defaultRender(tokens, idx, options, env, self);
      }
      
      const fileName = sanitizeFileName(href);
      const archiveHtml = `&nbsp;<a href="/archives/${fileName}" class="archive-link" target="_blank" rel="noopener noreferrer" title="Auto Snapshot">${ICON_HTML}</a>`;
      
      const closeHtml = defaultRender(tokens, idx, options, env, self);
      
      // 确保 defaultRender 成功返回 </a>
      return closeHtml + archiveHtml;
    }

    // 非外部链接或 href 为空，返回默认渲染
    return defaultRender(tokens, idx, options, env, self);
  }
}

export default externalArchivePlugin