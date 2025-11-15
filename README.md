
vitepress外链存档插件，增量生成/并发抓取

### 配置步骤

1. 下载`external-archive.ts`文件，放置到`${你的vitepress仓库}/docs/.vitepress/plugin`下；
2. 修改`external-archive.ts`文件，配置存档位置（默认在`public/archives/`）等参数；
3. 修改`vitepress`配置文件，可参考以下配置：
```typescript
import { generateArchiveIncremental } from './plugin/external-archive'
import externalArchivePlugin from './plugin/external-archive'

export default defineConfig({
  vite: {
    plugins: [
      {
        name: 'external-archive-plugin',
        async buildStart() {
          console.log('开始生成外链存档...')
          await generateArchiveIncremental('docs')
          console.log('外链存档生成完成')
        }
      }
    ]
  },
  markdown: {
    config(md) {
      md.use(externalArchivePlugin)
    }
  },
```
